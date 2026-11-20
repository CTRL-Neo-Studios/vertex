//! Samples to the line's bands: a Hann-windowed FFT of the latest `SIZE` mono samples, its bins gathered into `BANDS`
//! log-spaced bands from `LOW` to `HIGH` Hz, each band's loudest bin in decibels mapped from `FLOOR_DB`..0 dB to 0..255.

use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};
use std::sync::Arc;

pub const SIZE: usize = 2048;
pub const BANDS: usize = 32;
const LOW: f32 = 60.0;
const HIGH: f32 = 16_000.0;
const FLOOR_DB: f32 = -60.0;

pub struct Analyzer {
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    /// Each band's bins, `[from, to)`, at least one.
    edges: Vec<(usize, usize)>,
    buffer: Vec<Complex<f32>>,
}

impl Analyzer {
    pub fn new(sample_rate: f32) -> Self {
        let bin = sample_rate / SIZE as f32;
        let last = SIZE / 2;
        let at = |hz: f32| ((hz / bin).round() as usize).clamp(1, last);
        let edges = (0..BANDS)
            .map(|i| {
                let hz = |k: usize| LOW * (HIGH / LOW).powf(k as f32 / BANDS as f32);
                let from = at(hz(i));
                (from, at(hz(i + 1)).max(from + 1).min(last + 1))
            })
            .collect();
        let window = (0..SIZE).map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (SIZE - 1) as f32).cos()).collect();
        Self { fft: FftPlanner::new().plan_fft_forward(SIZE), window, edges, buffer: vec![Complex::default(); SIZE] }
    }

    /// The bands of `samples` (the latest `SIZE`, oldest first; fewer are padded with silence before them).
    pub fn bands(&mut self, samples: &[f32]) -> [u8; BANDS] {
        let pad = SIZE.saturating_sub(samples.len());
        let samples = &samples[samples.len().saturating_sub(SIZE)..];
        for (i, c) in self.buffer.iter_mut().enumerate() {
            let s = if i < pad { 0.0 } else { samples[i - pad] };
            *c = Complex::new(s * self.window[i], 0.0);
        }
        self.fft.process(&mut self.buffer);
        // A full-scale sine's bin is SIZE/4 under a Hann window: that's 0 dB.
        let scale = 4.0 / SIZE as f32;
        let mut out = [0u8; BANDS];
        for (band, &(from, to)) in out.iter_mut().zip(&self.edges) {
            let peak = self.buffer[from..to].iter().map(|c| c.norm()).fold(0.0, f32::max) * scale;
            let db = 20.0 * peak.max(1e-9).log10();
            *band = (((db - FLOOR_DB) / -FLOOR_DB).clamp(0.0, 1.0) * 255.0).round() as u8;
        }
        out
    }

    /// The band `hz` falls in.
    #[cfg(test)]
    fn band_of(&self, hz: f32, sample_rate: f32) -> usize {
        let bin = (hz / (sample_rate / SIZE as f32)).round() as usize;
        self.edges.iter().position(|&(from, to)| (from..to).contains(&bin)).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(hz: f32, amplitude: f32, rate: f32) -> Vec<f32> {
        (0..SIZE).map(|i| amplitude * (2.0 * std::f32::consts::PI * hz * i as f32 / rate).sin()).collect()
    }

    #[test]
    fn a_sine_is_loudest_in_its_band_and_quiet_far_from_it() {
        let rate = 48_000.0;
        let mut a = Analyzer::new(rate);
        for hz in [100.0, 1_000.0, 8_000.0] {
            let bands = a.bands(&sine(hz, 0.5, rate));
            let own = a.band_of(hz, rate);
            let loudest = (0..BANDS).max_by_key(|&i| bands[i]).unwrap();
            assert!(loudest.abs_diff(own) <= 1, "{hz} Hz: loudest band {loudest}, its own {own}: {bands:?}");
            // Half scale is -6 dB: about 0.9 of the way up.
            assert!(bands[loudest] > 210, "{hz} Hz: {bands:?}");
            let far = if own > BANDS / 2 { 0 } else { BANDS - 1 };
            assert!(bands[far] < 60, "{hz} Hz: band {far} is {}", bands[far]);
        }
    }

    #[test]
    fn silence_and_too_few_samples_are_zeros() {
        let mut a = Analyzer::new(44_100.0);
        assert_eq!(a.bands(&[0.0; SIZE]), [0; BANDS]);
        assert_eq!(a.bands(&[]), [0; BANDS]);
    }

    #[test]
    fn every_band_has_bins_and_they_climb() {
        for rate in [44_100.0, 48_000.0, 96_000.0] {
            let a = Analyzer::new(rate);
            assert!(a.edges.iter().all(|&(from, to)| from < to && to <= SIZE / 2 + 1));
            assert!(a.edges.windows(2).all(|w| w[0].0 <= w[1].0));
        }
    }
}
