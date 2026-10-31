//! Portable editing calculations. The web shell only maps these samples to commands.

fn valid_duration(duration: f64, requested: f64) -> bool {
    duration.is_finite() && requested.is_finite() && duration > 0.0 && requested > 0.0
}

/// Usage windows are evaluated here; the browser supplies the Pacific calendar day
/// using its timezone database. Missing token metadata is represented by -1.
#[unsafe(no_mangle)]
pub extern "C" fn quota_accumulate(
    field: u32,
    current: f64,
    at: f64,
    now: f64,
    same_day: u32,
    input_tokens: f64,
    total_tokens: f64,
    status: u32,
) -> f64 {
    if !at.is_finite() || !now.is_finite() || at > now || !current.is_finite() {
        return current;
    }
    let minute = now - at < 60_000.0;
    let day = same_day != 0;
    let delta = match field {
        0 if minute => 1.0,
        1 if minute && input_tokens >= 0.0 => input_tokens,
        2 if day => 1.0,
        3 if day && total_tokens >= 0.0 => total_tokens,
        4 if minute && input_tokens < 0.0 => 1.0,
        5 if day && total_tokens < 0.0 => 1.0,
        6 if day && (200..300).contains(&status) => 1.0,
        _ => 0.0,
    };
    current + delta
}

/// An absent limit or incomplete observations cannot produce a reliable remainder.
#[unsafe(no_mangle)]
pub extern "C" fn quota_remaining(limit: f64, observed: f64, incomplete: u32) -> f64 {
    if !limit.is_finite()
        || !observed.is_finite()
        || limit <= 0.0
        || observed < 0.0
        || incomplete != 0
    {
        return f64::NAN;
    }
    (limit - observed).max(0.0)
}

/// Eighteen samples, including both endpoints and a constant middle segment.
#[unsafe(no_mangle)]
pub extern "C" fn transition_time(point: u32, duration: f64, requested: f64) -> f64 {
    if point > 17 || !valid_duration(duration, requested) {
        return f64::NAN;
    }
    let edge = requested.min(duration / 2.0);
    if point < 9 {
        edge * point as f64 / 8.0
    } else {
        duration - edge + edge * (point - 9) as f64 / 8.0
    }
}

/// mode: 0 entrance, 1 exit, 2 both. channel: opacity, X, Y, scale X/Y, rotation.
/// NaN means this preset does not animate that property.
#[unsafe(no_mangle)]
pub extern "C" fn transition_value(
    preset: u32,
    mode: u32,
    channel: u32,
    point: u32,
    base: f64,
    extent: f64,
) -> f64 {
    if preset > 13 || mode > 2 || point > 17 || !base.is_finite() || !extent.is_finite() {
        return f64::NAN;
    }
    let progress = if point < 9 {
        point as f64 / 8.0
    } else {
        (point - 9) as f64 / 8.0
    };
    let eased = progress * progress * (3.0 - 2.0 * progress);
    let strength = if point < 9 {
        if mode == 1 { 0.0 } else { 1.0 - eased }
    } else if mode == 0 {
        0.0
    } else {
        eased
    };
    match channel {
        0 => base * (1.0 - strength),
        1 if preset == 3 => base - extent.abs() * strength,
        1 if preset == 4 => base + extent.abs() * strength,
        2 if preset == 5 => base - extent.abs() * strength,
        2 if preset == 6 => base + extent.abs() * strength,
        3 | 4 if preset == 1 => base * (1.0 - 0.3 * strength),
        3 | 4 if preset == 2 => base * (1.0 + 0.3 * strength),
        5 if preset == 7 => base - 15.0 * strength,
        1 | 2 if preset == 8 => base - extent.abs() * strength,
        1 | 2 if preset == 9 => base + extent.abs() * strength,
        5 if preset == 10 => base + 30.0 * strength,
        3 | 4 if preset == 10 => base * (1.0 - 0.15 * strength),
        5 if preset == 11 => base + 180.0 * strength,
        3 | 4 if preset == 11 => base * (1.0 - 0.4 * strength),
        3 | 4 if preset == 12 => {
            base * (1.0 - 0.35 * strength
                + 0.12 * (strength * std::f64::consts::PI * 3.0).sin() * (1.0 - strength))
        }
        1 if preset == 13 => {
            base - extent.abs()
                * (strength
                    - 0.08 * (strength * std::f64::consts::PI * 3.0).sin() * (1.0 - strength))
        }
        _ => f64::NAN,
    }
}

/// Original synthesized sounds; independent from browser audio APIs and external catalogs.
#[unsafe(no_mangle)]
pub extern "C" fn sound_duration(kind: u32) -> f64 {
    match kind {
        0 | 1 => 0.7,
        2 => 0.8,
        3 => 0.15,
        4 => 0.08,
        5 | 6 => 1.0,
        7 | 8 => 1.8,
        9 => 0.5,
        10 => 0.3,
        11 => 0.14,
        12 => 0.35,
        13 => 0.8,
        14 => 1.2,
        15 => 3.0,
        16 => 0.4,
        17 => 1.5,
        _ => 0.0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sound_sample(kind: u32, index: u32, rate: f64) -> f64 {
    if !rate.is_finite() || rate < 8000.0 {
        return 0.0;
    }
    let t = index as f64 / rate;
    let duration = sound_duration(kind);
    if t >= duration || duration == 0.0 {
        return 0.0;
    }
    let p = t / duration;
    let tau = std::f64::consts::TAU;
    let hash = index
        .wrapping_mul(747796405)
        .wrapping_add(kind.wrapping_mul(2891336453));
    let hash = (hash ^ (hash >> 16)).wrapping_mul(2246822519);
    let noise = (hash ^ (hash >> 13)) as f64 / u32::MAX as f64 * 2.0 - 1.0;
    let fade = (t * 200.0).min(1.0) * ((duration - t) * 100.0).min(1.0);
    let value = match kind {
        0 => noise * (std::f64::consts::PI * p).sin().powi(2) * 0.55,
        1 => {
            noise * (std::f64::consts::PI * p).sin().powi(4) * 0.5
                + (tau * (200.0 * t + 700.0 * t * t)).sin() * (1.0 - p) * 0.2
        }
        2 => {
            ((tau * (70.0 * t + 90.0 * (1.0 - (-20.0 * t).exp()) / 20.0)).sin() * (-10.0 * t).exp()
                + noise * (-35.0 * t).exp() * 0.5)
                * 0.65
        }
        3 => (tau * (500.0 * t + 1000.0 * t * t)).sin() * (-40.0 * t).exp() * 0.65,
        4 => noise * (-120.0 * t).exp() * 0.6,
        5 => ((tau * 660.0 * t).sin() + (tau * 990.0 * t).sin() * 0.5) * (-5.0 * t).exp() * 0.45,
        6 => ((tau * 440.0 * t).sin() + (tau * 523.25 * t).sin() * 0.5) * (-5.0 * t).exp() * 0.45,
        7 => {
            (tau * (120.0 * t + 550.0 * t * t)).sin() * p * (1.0 - p) * 1.5
                + noise * p * (1.0 - p) * 0.3
        }
        8 => (tau * (1400.0 * t - 350.0 * t * t)).sin() * (1.0 - p) * 0.35,
        9 => {
            (tau * (50.0 * t + 100.0 * (1.0 - (-30.0 * t).exp()) / 30.0)).sin()
                * (-12.0 * t).exp()
                * 0.85
        }
        10 => (noise * 0.7 + (tau * 180.0 * t).sin() * 0.2) * (-18.0 * t).exp(),
        11 => noise * (-40.0 * t).exp() * 0.35,
        12 => noise * (-16.0 * t).exp() * ((t * 60.0).cos().abs() * 0.5 + 0.5) * 0.6,
        13 => ((tau * 880.0 * t).sin() + (tau * 1320.0 * t).sin() * 0.4) * (-8.0 * t).exp() * 0.4,
        14 => {
            ((tau * 523.25 * t).sin() + (tau * 659.25 * t).sin() + (tau * 783.99 * t).sin())
                * (-4.0 * t).exp()
                * 0.22
        }
        15 => {
            ((tau * 220.0 * t).sin()
                + (tau * 329.63 * t).sin() * 0.5
                + (tau * 440.0 * t).sin() * 0.3)
                * (std::f64::consts::PI * p).sin()
                * 0.18
        }
        16 => (tau * 110.0 * t).sin() * noise * (-15.0 * t).exp() * 0.5,
        17 => {
            ((tau * 140.0 * t).sin() + (tau * 210.0 * t).sin() * 0.3)
                * (1.0 - p)
                * (t * 12.0).sin().abs()
                * 0.25
        }
        _ => 0.0,
    };
    (value * fade).clamp(-0.95, 0.95)
}

/// Reject excessive operations instead of silently truncating the user's edit.
#[unsafe(no_mangle)]
pub extern "C" fn cut_count(duration: f64, interval: f64) -> i32 {
    if !valid_duration(duration, interval) {
        return -1;
    }
    let count = (duration / interval).ceil() - 1.0;
    if count > 200.0 {
        -1
    } else {
        count.max(0.0) as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quota_windows_expire_and_do_not_include_future_requests() {
        assert_eq!(
            quota_accumulate(0, 0.0, 1.0, 60_000.0, 1, 10.0, 20.0, 200),
            1.0
        );
        assert_eq!(
            quota_accumulate(0, 0.0, 0.0, 60_000.0, 1, 10.0, 20.0, 200),
            0.0
        );
        assert_eq!(
            quota_accumulate(2, 0.0, 60_001.0, 60_000.0, 1, 10.0, 20.0, 200),
            0.0
        );
        assert_eq!(
            quota_accumulate(2, 0.0, 0.0, 60_000.0, 0, 10.0, 20.0, 200),
            0.0
        );
    }
    #[test]
    fn quota_uses_input_tokens_for_tpm_and_marks_missing_usage() {
        assert_eq!(
            quota_accumulate(1, 0.0, 10.0, 100.0, 1, 10.0, 35.0, 200),
            10.0
        );
        assert_eq!(
            quota_accumulate(3, 0.0, 10.0, 100.0, 1, 10.0, 35.0, 200),
            35.0
        );
        assert_eq!(
            quota_accumulate(4, 0.0, 10.0, 100.0, 1, -1.0, -1.0, 429),
            1.0
        );
        assert_eq!(
            quota_accumulate(5, 0.0, 10.0, 100.0, 1, -1.0, -1.0, 429),
            1.0
        );
    }
    #[test]
    fn quota_never_invents_a_remainder_without_limits_or_complete_usage() {
        assert!(quota_remaining(0.0, 10.0, 0).is_nan());
        assert!(quota_remaining(100.0, 10.0, 1).is_nan());
        assert_eq!(quota_remaining(100.0, 10.0, 0), 90.0);
        assert_eq!(quota_remaining(10.0, 100.0, 0), 0.0);
    }
    #[test]
    fn short_clips_have_ordered_samples_within_bounds() {
        let times: Vec<f64> = (0..18).map(|i| transition_time(i, 10.0, 100.0)).collect();
        assert_eq!(times[0], 0.0);
        assert_eq!(times[17], 10.0);
        assert!(times.windows(2).all(|w| w[0] <= w[1]));
    }
    #[test]
    fn entrances_and_exits_preserve_custom_values() {
        assert_eq!(transition_value(0, 0, 0, 0, 0.6, 100.0), 0.0);
        assert_eq!(transition_value(0, 0, 0, 17, 0.6, 100.0), 0.6);
        assert_eq!(transition_value(1, 2, 3, 8, 2.0, 100.0), 2.0);
        assert_eq!(transition_value(3, 1, 1, 0, 120.0, 1920.0), 120.0);
        assert!(transition_value(0, 0, 1, 0, 0.0, 1.0).is_nan());
    }
    #[test]
    fn cuts_do_not_create_empty_tail_and_are_bounded() {
        assert_eq!(cut_count(10.0, 2.0), 4);
        assert_eq!(cut_count(10.1, 2.0), 5);
        assert_eq!(cut_count(1.0, 2.0), 0);
        assert_eq!(cut_count(1000.0, 0.1), -1);
        assert_eq!(cut_count(f64::NAN, 1.0), -1);
    }
}
