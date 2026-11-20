//! The default output's volume (Core Audio), and the players macOS lets another app control: Apple Music and Spotify,
//! by their scripting (`osascript`), asked only while running so nothing is launched. Media keys and MediaRemote's
//! commands sent by an app reach no player on macOS 27 (the App Plugins Plan, B0).

use objc2_app_kit::NSRunningApplication;
use objc2_core_audio::{
    kAudioDevicePropertyMute, kAudioDevicePropertyVolumeScalar, kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyElementMain,
    kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyScopeOutput, kAudioObjectSystemObject, AudioObjectGetPropertyData, AudioObjectHasProperty,
    AudioObjectID, AudioObjectPropertyAddress, AudioObjectSetPropertyData,
};
use objc2_foundation::NSString;
use serde::Serialize;
use std::ffi::c_void;
use std::process::Command;
use std::ptr::{self, NonNull};

#[derive(Serialize, Debug, PartialEq)]
pub struct Volume {
    /// 0–1.
    pub volume: f32,
    pub muted: bool,
}

fn address(selector: u32, scope: u32, element: u32) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress { mSelector: selector, mScope: scope, mElement: element }
}

unsafe fn get<T: Default>(object: AudioObjectID, address: AudioObjectPropertyAddress) -> Option<T> {
    if !AudioObjectHasProperty(object, NonNull::from(&address)) {
        return None;
    }
    let mut value = T::default();
    let mut size = size_of::<T>() as u32;
    let status = AudioObjectGetPropertyData(object, NonNull::from(&address), 0, ptr::null(), NonNull::from(&mut size), NonNull::from(&mut value).cast::<c_void>());
    (status == 0).then_some(value)
}

unsafe fn set<T>(object: AudioObjectID, address: AudioObjectPropertyAddress, mut value: T) -> Result<(), String> {
    let status = AudioObjectSetPropertyData(object, NonNull::from(&address), 0, ptr::null(), size_of::<T>() as u32, NonNull::from(&mut value).cast::<c_void>());
    if status == 0 { Ok(()) } else { Err(format!("setting the volume failed ({status})")) }
}

fn output() -> Result<AudioObjectID, String> {
    let system = kAudioObjectSystemObject as AudioObjectID;
    unsafe { get::<AudioObjectID>(system, address(kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain)) }
        .filter(|&d| d != 0)
        .ok_or_else(|| "no output device".into())
}

/// The elements whose volume is the device's: its main one, else its first two channels (a device without a main
/// volume has one per channel); none, a device without a volume (HDMI, some DACs).
fn volume_elements(device: AudioObjectID) -> Vec<u32> {
    let has = |e| unsafe { AudioObjectHasProperty(device, NonNull::from(&address(kAudioDevicePropertyVolumeScalar, kAudioObjectPropertyScopeOutput, e))) };
    if has(kAudioObjectPropertyElementMain) { vec![kAudioObjectPropertyElementMain] } else { (1..=2).filter(|&e| has(e)).collect() }
}

pub fn volume() -> Result<Volume, String> {
    let device = output()?;
    let elements = volume_elements(device);
    if elements.is_empty() {
        return Err("unsupported".into());
    }
    let levels: Vec<f32> = elements.iter().filter_map(|&e| unsafe { get::<f32>(device, address(kAudioDevicePropertyVolumeScalar, kAudioObjectPropertyScopeOutput, e)) }).collect();
    let muted = unsafe { get::<u32>(device, address(kAudioDevicePropertyMute, kAudioObjectPropertyScopeOutput, kAudioObjectPropertyElementMain)) }.unwrap_or(0) != 0;
    Ok(Volume { volume: levels.iter().sum::<f32>() / levels.len().max(1) as f32, muted })
}

/// Sets the volume; above zero it also unmutes, as the system's own slider does.
pub fn set_volume(volume: f32) -> Result<(), String> {
    let volume = volume.clamp(0.0, 1.0);
    let device = output()?;
    let elements = volume_elements(device);
    if elements.is_empty() {
        return Err("unsupported".into());
    }
    for e in elements {
        unsafe { set(device, address(kAudioDevicePropertyVolumeScalar, kAudioObjectPropertyScopeOutput, e), volume)? };
    }
    let mute = address(kAudioDevicePropertyMute, kAudioObjectPropertyScopeOutput, kAudioObjectPropertyElementMain);
    if volume > 0.0 && unsafe { get::<u32>(device, mute) }.is_some_and(|m| m != 0) {
        unsafe { set(device, mute, 0u32)? };
    }
    Ok(())
}

/// The players Vertex may control, by the name the plugin uses and their bundle id.
pub const PLAYERS: &[(&str, &str)] = &[("music", "com.apple.Music"), ("spotify", "com.spotify.client")];

#[derive(Serialize, Debug, PartialEq)]
pub struct Player {
    pub app: &'static str,
    /// `playing` or `paused`.
    pub state: String,
}

fn running(bundle: &str) -> bool {
    NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(bundle)).count() > 0
}

/// Runs `body` in `tell application id "bundle"`, answering its text; the first call asks the user to let Vertex
/// control that app.
fn tell(bundle: &str, body: &str) -> Result<String, String> {
    let out = Command::new("/usr/bin/osascript").args(["-e", &format!("tell application id \"{bundle}\" to {body}")]).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let error = String::from_utf8_lossy(&out.stderr);
        // -1743: the user (or the sandbox) didn't allow Vertex to control the app.
        return Err(if error.contains("-1743") { "denied".into() } else { error.trim().to_string() });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// The scriptable player to show controls for: one that's playing, else one that's paused (so it can be resumed);
/// none when neither runs. Never launches either.
pub fn player() -> Result<Option<Player>, String> {
    let mut paused = None;
    for &(app, bundle) in PLAYERS {
        if !running(bundle) {
            continue;
        }
        match tell(bundle, "player state as text")?.as_str() {
            "playing" => return Ok(Some(Player { app, state: "playing".into() })),
            "paused" if paused.is_none() => paused = Some(Player { app, state: "paused".into() }),
            _ => {}
        }
    }
    Ok(paused)
}

/// The script for a control, or `None` for one that isn't.
pub fn script(command: &str) -> Option<&'static str> {
    match command {
        "play_pause" => Some("playpause"),
        "next" => Some("next track"),
        "previous" => Some("previous track"),
        _ => None,
    }
}

pub fn command(app: &str, command: &str) -> Result<(), String> {
    let bundle = PLAYERS.iter().find(|(name, _)| *name == app).map(|(_, b)| *b).ok_or_else(|| format!("not a player Vertex controls: {app:?}"))?;
    let script = script(command).ok_or_else(|| format!("not a control: {command:?}"))?;
    if !running(bundle) {
        return Err(format!("{app} isn't running"));
    }
    tell(bundle, script).map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_known_players_and_controls_are_sent() {
        assert!(command("cider", "next").unwrap_err().contains("not a player"));
        assert!(command("music", "quit").unwrap_err().contains("not a control"));
        // A name that would end the `tell` and run more script never gets that far.
        assert!(command("music", "playpause\" & do shell script \"x").is_err());
    }
}
