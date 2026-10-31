//! Portable editing calculations. The web shell only maps these samples to commands.

fn valid_duration(duration: f64, requested: f64) -> bool {
    duration.is_finite() && requested.is_finite() && duration > 0.0 && requested > 0.0
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
    if preset > 7 || mode > 2 || point > 17 || !base.is_finite() || !extent.is_finite() {
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
        _ => f64::NAN,
    }
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
