export interface TimelineAudio {
	samples: Float32Array;
	sampleRate: number;
}

export interface TimeRange {
	start: number;
	end: number;
}

const FRAME_SECONDS = 0.02;
const SILENCE_FLOOR_DB = -100;

function frameLevelsDb({ samples, sampleRate }: TimelineAudio): Float32Array {
	const frameSize = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
	const frameCount = Math.ceil(samples.length / frameSize);
	const levels = new Float32Array(frameCount);
	for (let frame = 0; frame < frameCount; frame++) {
		const from = frame * frameSize;
		const to = Math.min(samples.length, from + frameSize);
		let sum = 0;
		for (let i = from; i < to; i++) {
			sum += samples[i] * samples[i];
		}
		const rms = Math.sqrt(sum / Math.max(1, to - from));
		levels[frame] =
			rms > 0
				? Math.max(SILENCE_FLOOR_DB, 20 * Math.log10(rms))
				: SILENCE_FLOOR_DB;
	}
	return levels;
}

function percentile({
	values,
	ratio,
}: {
	values: Float32Array;
	ratio: number;
}): number {
	if (values.length === 0) return SILENCE_FLOOR_DB;
	const sorted = Float32Array.from(values).sort();
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.floor(ratio * (sorted.length - 1))),
	);
	return sorted[index];
}

/**
 * Adaptive threshold: sits ~30% of the way from the noise floor to the speech
 * level, so it works for both clean studio audio and noisy phone recordings.
 */
function estimateThresholdDb({ levels }: { levels: Float32Array }): number {
	const noiseFloor = percentile({ values: levels, ratio: 0.1 });
	const speechLevel = percentile({ values: levels, ratio: 0.9 });
	const threshold = noiseFloor + Math.max(6, (speechLevel - noiseFloor) * 0.3);
	return Math.min(-20, Math.max(-60, threshold));
}

export function detectSilences({
	audio,
	minSilenceSeconds,
	paddingSeconds,
	thresholdDb,
}: {
	audio: TimelineAudio;
	minSilenceSeconds: number;
	paddingSeconds: number;
	thresholdDb?: number;
}): { ranges: TimeRange[]; thresholdDb: number } {
	const levels = frameLevelsDb(audio);
	const threshold = thresholdDb ?? estimateThresholdDb({ levels });
	const totalSeconds = audio.samples.length / audio.sampleRate;
	const ranges: TimeRange[] = [];

	let runStart = -1;
	for (let frame = 0; frame <= levels.length; frame++) {
		const silent = frame < levels.length && levels[frame] < threshold;
		if (silent && runStart < 0) {
			runStart = frame;
		} else if (!silent && runStart >= 0) {
			const start = runStart * FRAME_SECONDS;
			const end = Math.min(totalSeconds, frame * FRAME_SECONDS);
			if (end - start >= minSilenceSeconds) {
				// Keep breathing room next to speech, but not at the timeline edges.
				const paddedStart = start <= 0 ? 0 : start + paddingSeconds;
				const paddedEnd =
					end >= totalSeconds - FRAME_SECONDS
						? totalSeconds
						: end - paddingSeconds;
				if (paddedEnd - paddedStart > FRAME_SECONDS) {
					ranges.push({
						start: Math.round(paddedStart * 1000) / 1000,
						end: Math.round(paddedEnd * 1000) / 1000,
					});
				}
			}
			runStart = -1;
		}
	}

	return { ranges, thresholdDb: Math.round(threshold * 10) / 10 };
}
