//! Now Playing's system side (plugin `vertex-media`, for the core plugin `now-playing`): the system's audio as the line's
//! bands, the output's volume, and the scriptable players' controls (`system.rs`).
//!
//! The bands: one capture for the app, started by the first listener and torn down after the last; every ~33 ms a
//! thread turns the latest samples into `bands::BANDS` levels (0–255) and sends them to each listener as raw bytes. A
//! pause sends one frame of zeros, then nothing until sound comes back.

mod bands;
#[cfg(target_os = "macos")]
mod tap;
#[cfg(not(target_os = "macos"))]
mod tap {
    pub struct Tap {
        pub sample_rate: f32,
    }
    pub fn start(_: std::sync::Arc<std::sync::Mutex<crate::Ring>>) -> Result<Tap, String> {
        Err("unsupported".into())
    }
}
#[cfg(target_os = "macos")]
mod system;
#[cfg(not(target_os = "macos"))]
mod system {
    pub type Volume = ();
    pub type Player = ();
    pub fn volume() -> Result<Volume, String> {
        Err("unsupported".into())
    }
    pub fn set_volume(_: f32) -> Result<(), String> {
        Err("unsupported".into())
    }
    pub fn player() -> Result<Option<Player>, String> {
        Err("unsupported".into())
    }
    pub fn command(_: &str, _: &str) -> Result<(), String> {
        Err("unsupported".into())
    }
}

pub use bands::BANDS;
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, RunEvent, Runtime, State, Webview, WindowEvent};
use tauri_plugin_vertex::api;

/// The core plugin whose windows may call this.
pub const PLUGIN: &str = "now-playing";

/// Session windows draw the line and its popover.
pub const GRANTS: api::Grants = &[(
    api::WindowKind::Session,
    &[
        "vertex-media:allow-media-levels-listen",
        "vertex-media:allow-media-levels-stop",
        "vertex-media:allow-media-volume",
        "vertex-media:allow-media-set-volume",
        "vertex-media:allow-media-player",
        "vertex-media:allow-media-command",
    ],
)];

const FRAME: Duration = Duration::from_millis(33);
/// Silent frames (no new samples, or every band near zero) before the zero frame; about half a second.
const QUIET: u32 = 15;
const NEAR_ZERO: u8 = 8;

/// The latest mono samples, and how many were ever written (no new ones since the last frame is silence: a paused
/// player stops the tap's buffers rather than sending zeros).
pub struct Ring {
    samples: VecDeque<f32>,
    written: u64,
}

impl Ring {
    fn new() -> Self {
        Self { samples: VecDeque::with_capacity(2 * bands::SIZE), written: 0 }
    }

    /// Keeps the latest `2 * SIZE`; makes room first, so the deque never grows on the audio thread.
    fn push(&mut self, samples: impl ExactSizeIterator<Item = f32>) {
        let (cap, len) = (self.samples.capacity(), samples.len());
        let n = len.min(cap);
        let over = (self.samples.len() + n).saturating_sub(cap);
        self.samples.drain(..over.min(self.samples.len()));
        self.samples.extend(samples.skip(len - n));
        self.written += n as u64;
    }
}

type Sender = Box<dyn Fn(&[u8; BANDS]) + Send>;

struct Listener {
    window: String,
    send: Sender,
}

struct Running {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
    _tap: tap::Tap,
}

#[derive(Default)]
struct Shared {
    next: u32,
    listeners: HashMap<u32, Listener>,
    running: Option<Running>,
}

#[derive(Default)]
pub struct Levels(Arc<Mutex<Shared>>);

impl Levels {
    /// Adds a listener, starting the capture if it's the first.
    pub fn listen(&self, window: String, send: Sender) -> Result<u32, String> {
        let mut state = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        if state.running.is_none() {
            state.running = Some(self.start()?);
        }
        state.next += 1;
        let id = state.next;
        state.listeners.insert(id, Listener { window, send });
        Ok(id)
    }

    pub fn stop(&self, id: u32) {
        self.remove(|l_id, _| l_id == id);
    }

    /// A window gone: its listeners with it.
    pub fn drop_window(&self, label: &str) {
        self.remove(|_, l| l.window == label);
    }

    fn remove(&self, which: impl Fn(u32, &Listener) -> bool) {
        let running = {
            let mut state = self.0.lock().unwrap_or_else(PoisonError::into_inner);
            state.listeners.retain(|&id, l| !which(id, l));
            if state.listeners.is_empty() { state.running.take() } else { None }
        };
        // Joined outside the lock: the thread takes it to send.
        if let Some(Running { stop, thread, _tap }) = running {
            stop.store(true, Ordering::Relaxed);
            let _ = thread.join();
            drop(_tap);
        }
    }

    fn start(&self) -> Result<Running, String> {
        let ring = Arc::new(Mutex::new(Ring::new()));
        let tap = tap::start(ring.clone())?;
        let stop = Arc::new(AtomicBool::new(false));
        let (state, stopped, rate) = (self.0.clone(), stop.clone(), tap.sample_rate);
        let thread = std::thread::Builder::new()
            .name("vertex-media-levels".into())
            .spawn(move || {
                let mut analyzer = bands::Analyzer::new(rate);
                let mut samples = Vec::with_capacity(bands::SIZE);
                let (mut seen, mut quiet) = (0u64, 0u32);
                // By deadline, so the work between sleeps doesn't slow the rate.
                let mut next = std::time::Instant::now();
                while !stopped.load(Ordering::Relaxed) {
                    next += FRAME;
                    std::thread::sleep(next.saturating_duration_since(std::time::Instant::now()));
                    let fresh = {
                        let ring = ring.lock().unwrap_or_else(PoisonError::into_inner);
                        samples.clear();
                        samples.extend(ring.samples.range(ring.samples.len().saturating_sub(bands::SIZE)..));
                        std::mem::replace(&mut seen, ring.written) != ring.written
                    };
                    let mut frame = if fresh { analyzer.bands(&samples) } else { [0; BANDS] };
                    if frame.iter().all(|&b| b < NEAR_ZERO) {
                        quiet += 1;
                        if quiet > QUIET {
                            continue;
                        }
                        if quiet == QUIET {
                            frame = [0; BANDS];
                        }
                    } else {
                        quiet = 0;
                    }
                    let state = state.lock().unwrap_or_else(PoisonError::into_inner);
                    for listener in state.listeners.values() {
                        (listener.send)(&frame);
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(Running { stop, thread, _tap: tap })
    }
}

/// Starts sending the line's bands to `channel` (raw bytes, `BANDS` of them a frame); answers the listener's id.
#[tauri::command]
fn media_levels_listen<R: Runtime>(webview: Webview<R>, levels: State<'_, Levels>, channel: Channel<InvokeResponseBody>) -> Result<u32, String> {
    let send = Box::new(move |frame: &[u8; BANDS]| {
        let _ = channel.send(InvokeResponseBody::Raw(frame.to_vec()));
    });
    levels.listen(webview.label().to_string(), send)
}

#[tauri::command]
fn media_levels_stop(levels: State<'_, Levels>, id: u32) {
    levels.stop(id);
}

/// The default output's volume (0–1) and mute; `unsupported` for a device without a volume.
#[tauri::command]
async fn media_volume() -> Result<system::Volume, String> {
    api::blocking(system::volume).await
}

#[tauri::command]
async fn media_set_volume(volume: f32) -> Result<(), String> {
    api::blocking(move || system::set_volume(volume)).await
}

/// Music or Spotify, when one is running and playing or paused; `null` otherwise (no controls to draw).
#[tauri::command]
async fn media_player() -> Result<Option<system::Player>, String> {
    api::blocking(system::player).await
}

/// `play_pause`, `next` or `previous` to `music` or `spotify`.
#[tauri::command]
async fn media_command(app: String, command: String) -> Result<(), String> {
    api::blocking(move || system::command(&app, &command)).await
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("vertex-media")
        .invoke_handler(tauri::generate_handler![media_levels_listen, media_levels_stop, media_volume, media_set_volume, media_player, media_command])
        .setup(|app, _api| {
            app.manage(Levels::default());
            api::grant(app, PLUGIN, GRANTS);
            Ok(())
        })
        .on_event(|app, event| {
            if let RunEvent::WindowEvent { label, event: WindowEvent::Destroyed, .. } = event {
                app.state::<Levels>().drop_window(label);
            }
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ring_keeps_the_latest_and_counts_what_came() {
        let mut ring = Ring::new();
        let cap = ring.samples.capacity();
        ring.push((0..10).map(|i| i as f32));
        ring.push((0..cap + 5).map(|i| i as f32));
        assert_eq!(ring.samples.len(), cap);
        assert_eq!(ring.samples.back(), Some(&((cap + 4) as f32)));
        assert_eq!(ring.samples.front(), Some(&5.0));
        assert_eq!(ring.written, (10 + cap) as u64);
        assert_eq!(ring.samples.capacity(), cap);
    }
}
