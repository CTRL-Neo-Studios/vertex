//! The system's audio on macOS 14.2+: a private global process tap (everything apps play, before the output's volume
//! and mute) read through a private aggregate device that starts it. The IO block only mixes each buffer to mono into
//! the ring, and never waits for it.

use crate::Ring;
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject};
use objc2::AllocAnyThread;
use objc2_core_audio::{
    kAudioAggregateDeviceIsPrivateKey, kAudioAggregateDeviceNameKey, kAudioAggregateDeviceTapAutoStartKey,
    kAudioAggregateDeviceTapListKey, kAudioAggregateDeviceUIDKey, kAudioDevicePropertyNominalSampleRate,
    kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioSubTapUIDKey, AudioDeviceCreateIOProcIDWithBlock,
    AudioDeviceDestroyIOProcID, AudioDeviceIOProcID, AudioDeviceStart, AudioDeviceStop, AudioHardwareCreateAggregateDevice,
    AudioHardwareCreateProcessTap, AudioHardwareDestroyAggregateDevice, AudioHardwareDestroyProcessTap, AudioObjectGetPropertyData,
    AudioObjectID, AudioObjectPropertyAddress, CATapDescription, CATapMuteBehavior,
};
use objc2_core_audio_types::{AudioBuffer, AudioBufferList, AudioTimeStamp};
use objc2_core_foundation::CFDictionary;
use objc2_foundation::{NSArray, NSDictionary, NSNumber, NSString, NSUUID};
use std::ffi::{c_void, CStr};
use std::ptr::{self, NonNull};
use std::sync::{Arc, Mutex};

type IoBlock = RcBlock<dyn Fn(NonNull<AudioTimeStamp>, NonNull<AudioBufferList>, NonNull<AudioTimeStamp>, NonNull<AudioBufferList>, NonNull<AudioTimeStamp>)>;

pub struct Tap {
    tap: AudioObjectID,
    device: AudioObjectID,
    proc_id: AudioDeviceIOProcID,
    _block: IoBlock,
    pub sample_rate: f32,
}

// Core Audio's ids may be used and destroyed from any thread; the block is only kept alive here, never called.
unsafe impl Send for Tap {}

fn failed(what: &str, status: i32) -> String {
    format!("{what} failed ({status})")
}

fn key(k: &CStr) -> Retained<NSString> {
    NSString::from_str(k.to_str().expect("Core Audio's keys are ASCII"))
}

/// Starts tapping into `ring`; `unsupported` before macOS 14.2.
pub fn start(ring: Arc<Mutex<Ring>>) -> Result<Tap, String> {
    if AnyClass::get(c"CATapDescription").is_none() {
        return Err("unsupported".into());
    }
    unsafe {
        let description = CATapDescription::initStereoGlobalTapButExcludeProcesses(CATapDescription::alloc(), &NSArray::new());
        let uuid = NSUUID::UUID();
        description.setUUID(&uuid);
        description.setPrivate(true);
        description.setMuteBehavior(CATapMuteBehavior::Unmuted);
        let mut tap: AudioObjectID = 0;
        let status = AudioHardwareCreateProcessTap(Some(&description), &mut tap);
        if status != 0 {
            return Err(failed("the audio tap", status));
        }
        match aggregate(&uuid.UUIDString(), ring) {
            Ok((device, proc_id, block, sample_rate)) => Ok(Tap { tap, device, proc_id, _block: block, sample_rate }),
            Err(e) => {
                AudioHardwareDestroyProcessTap(tap);
                Err(e)
            }
        }
    }
}

/// A private aggregate device over the tap `uid`, started, its IO block feeding `ring`.
unsafe fn aggregate(uid: &NSString, ring: Arc<Mutex<Ring>>) -> Result<(AudioObjectID, AudioDeviceIOProcID, IoBlock, f32), String> {
    let sub_tap = NSDictionary::<NSString, AnyObject>::from_slices(&[&*key(kAudioSubTapUIDKey)], &[uid]);
    let taps = NSArray::from_slice(&[&*sub_tap]);
    let yes = NSNumber::new_bool(true);
    let name = NSString::from_str("Vertex Now Playing");
    let own_uid = NSUUID::UUID().UUIDString();
    let keys = [kAudioAggregateDeviceNameKey, kAudioAggregateDeviceUIDKey, kAudioAggregateDeviceIsPrivateKey, kAudioAggregateDeviceTapAutoStartKey, kAudioAggregateDeviceTapListKey].map(key);
    let values: [&AnyObject; 5] = [&name, &own_uid, &yes, &yes, &taps];
    let description = NSDictionary::<NSString, AnyObject>::from_slices(&keys.each_ref().map(|k| &**k), &values);
    // NSDictionary is toll-free bridged to CFDictionary.
    let description = &*(Retained::as_ptr(&description) as *const CFDictionary);
    let mut device: AudioObjectID = 0;
    let status = AudioHardwareCreateAggregateDevice(description, NonNull::from(&mut device));
    if status != 0 {
        return Err(failed("the aggregate device", status));
    }
    let block: IoBlock = RcBlock::new(move |_: NonNull<AudioTimeStamp>, input: NonNull<AudioBufferList>, _: NonNull<AudioTimeStamp>, _: NonNull<AudioBufferList>, _: NonNull<AudioTimeStamp>| {
        let list = input.as_ref();
        if list.mNumberBuffers == 0 {
            return;
        }
        let AudioBuffer { mNumberChannels, mDataByteSize, mData } = list.mBuffers[0];
        if mData.is_null() {
            return;
        }
        let channels = mNumberChannels.max(1) as usize;
        let samples = std::slice::from_raw_parts(mData as *const f32, mDataByteSize as usize / 4);
        // Never wait on the real-time thread: a buffer that finds the ring busy is dropped.
        if let Ok(mut ring) = ring.try_lock() {
            ring.push(samples.chunks_exact(channels).map(|frame| frame.iter().sum::<f32>() / channels as f32));
        }
    });
    let mut proc_id: AudioDeviceIOProcID = None;
    let mut status = AudioDeviceCreateIOProcIDWithBlock(NonNull::from(&mut proc_id), device, None, RcBlock::as_ptr(&block));
    if status == 0 {
        status = AudioDeviceStart(device, proc_id);
        if status != 0 {
            AudioDeviceDestroyIOProcID(device, proc_id);
        }
    }
    if status != 0 {
        AudioHardwareDestroyAggregateDevice(device);
        return Err(failed("starting the capture", status));
    }
    Ok((device, proc_id, block, sample_rate(device).unwrap_or(48_000.0)))
}

unsafe fn sample_rate(device: AudioObjectID) -> Option<f32> {
    let address = AudioObjectPropertyAddress { mSelector: kAudioDevicePropertyNominalSampleRate, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain };
    let mut rate = 0f64;
    let mut size = size_of::<f64>() as u32;
    let status = AudioObjectGetPropertyData(device, NonNull::from(&address), 0, ptr::null(), NonNull::from(&mut size), NonNull::from(&mut rate).cast::<c_void>());
    (status == 0 && rate > 0.0).then_some(rate as f32)
}

impl Drop for Tap {
    fn drop(&mut self) {
        unsafe {
            AudioDeviceStop(self.device, self.proc_id);
            AudioDeviceDestroyIOProcID(self.device, self.proc_id);
            AudioHardwareDestroyAggregateDevice(self.device);
            AudioHardwareDestroyProcessTap(self.tap);
        }
    }
}
