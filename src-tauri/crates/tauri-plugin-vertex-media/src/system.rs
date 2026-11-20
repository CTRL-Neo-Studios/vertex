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
use serde::{Deserialize, Serialize};
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

/// `osascript` with `args`, its output's text; a refusal to control an app (-1743) answers `denied`.
fn osascript(args: &[&str]) -> Result<String, String> {
    let out = Command::new("/usr/bin/osascript").args(args).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let error = String::from_utf8_lossy(&out.stderr);
        return Err(if error.contains("-1743") { "denied".into() } else { error.trim().to_string() });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Runs `body` in `tell application id "bundle"`; the first call asks the user to let Vertex control that app.
fn tell(bundle: &str, body: &str) -> Result<String, String> {
    osascript(&["-e", &format!("tell application id \"{bundle}\" to {body}")])
}

/// What macOS says is playing, any app. Since macOS 15.4 MediaRemote answers only Apple's own processes; `osascript`
/// is one, and its JavaScript bridge reaches `MRNowPlayingRequest`. `null` when nothing is.
const NOW_PLAYING: &str = r#"
ObjC.import('Foundation')
$.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/MediaRemote.framework/').load
const request = $.NSClassFromString('MRNowPlayingRequest')
const info = request.localNowPlayingItem.nowPlayingInfo
if (info.isNil()) 'null'; else {
  const value = (key) => { const v = info.valueForKey('kMRMediaRemoteNowPlayingInfo' + key); return v.isNil() ? null : v.js }
  const client = request.localNowPlayingPlayerPath.client
  JSON.stringify({
    app: client.isNil() ? null : client.bundleIdentifier.js,
    playing: request.localIsPlaying,
    title: value('Title'), artist: value('Artist'), album: value('Album'),
    duration: value('Duration'), elapsed: value('ElapsedTime'), rate: value('PlaybackRate'), timestamp: value('Timestamp'),
  })
}
"#;

/// A track as macOS reports it. `elapsed` is the position at `timestamp`; the position now is
/// `elapsed + rate × (now − timestamp)`.
#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct NowPlaying {
    /// The bundle id of the app playing.
    pub app: Option<String>,
    pub playing: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    /// Seconds.
    pub duration: Option<f64>,
    pub elapsed: Option<f64>,
    pub rate: Option<f64>,
    /// ISO 8601.
    pub timestamp: Option<String>,
}

fn parse_now_playing(json: &str) -> Result<Option<NowPlaying>, String> {
    serde_json::from_str(json).map_err(|e| format!("now playing: {e}"))
}

/// `unsupported` when MediaRemote no longer answers (the sandbox, or a macOS that closed this way too).
pub fn now_playing() -> Result<Option<NowPlaying>, String> {
    parse_now_playing(&osascript(&["-l", "JavaScript", "-e", NOW_PLAYING]).map_err(|_| "unsupported".to_string())?)
}

/// The scriptable player to show controls for: the app macOS says is playing, when it's Music or Spotify; none when
/// it's another (Cider). If macOS can't say, one of the two that's playing, else one that's paused (so it can be
/// resumed). Never launches either.
pub fn player() -> Result<Option<Player>, String> {
    let now = now_playing().ok().flatten().and_then(|n| n.app);
    let mut states = Vec::new();
    for &(app, bundle) in PLAYERS {
        if running(bundle) {
            states.push((app, bundle, tell(bundle, "player state as text")?));
        }
    }
    Ok(pick(now.as_deref(), &states))
}

fn pick(now: Option<&str>, states: &[(&'static str, &str, String)]) -> Option<Player> {
    let candidates: Vec<_> = states.iter().filter(|(_, bundle, _)| now.is_none_or(|n| n == *bundle)).collect();
    let with = |state: &str| candidates.iter().find(|(_, _, s)| s == state).map(|(app, _, s)| Player { app, state: s.clone() });
    with("playing").or_else(|| with("paused"))
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

    #[test]
    fn controls_follow_the_app_macos_says_is_playing() {
        let music_paused = ("music", "com.apple.Music", "paused".to_string());
        let spotify_playing = ("spotify", "com.spotify.client", "playing".to_string());
        let both = [music_paused.clone(), spotify_playing.clone()];
        // Cider plays while Music sits paused: no controls.
        assert_eq!(pick(Some("sh.cider.genten.mac"), &[music_paused.clone()]), None);
        // macOS names one of the two: that one, even paused while the other plays.
        assert_eq!(pick(Some("com.apple.Music"), &both), Some(Player { app: "music", state: "paused".into() }));
        // macOS can't say: playing first, else paused.
        assert_eq!(pick(None, &both), Some(Player { app: "spotify", state: "playing".into() }));
        assert_eq!(pick(None, &[music_paused]), Some(Player { app: "music", state: "paused".into() }));
        assert_eq!(pick(None, &[]), None);
    }

    #[test]
    fn now_playing_reads_what_the_script_prints() {
        let json = r#"{"app":"com.apple.Music","playing":false,"title":"[12:00am] Motif","artist":"aksfx","album":null,"duration":270.015,"elapsed":1.68,"rate":0,"timestamp":"2026-11-20T03:25:20.212Z"}"#;
        let now = parse_now_playing(json).unwrap().unwrap();
        assert_eq!((now.app.as_deref(), now.title.as_deref(), now.duration, now.rate), (Some("com.apple.Music"), Some("[12:00am] Motif"), Some(270.015), Some(0.0)));
        assert_eq!(parse_now_playing("null").unwrap(), None);
    }
}
