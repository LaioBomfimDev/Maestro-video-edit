import { describe, expect, test } from "bun:test";
import { detectSilences } from "../silence-detection";

const SAMPLE_RATE = 16_000;

function buildAudio({
	pattern,
}: {
	pattern: Array<{ seconds: number; loud: boolean }>;
}) {
	const total = pattern.reduce((sum, part) => sum + part.seconds, 0);
	const samples = new Float32Array(Math.round(total * SAMPLE_RATE));
	let offset = 0;
	for (const part of pattern) {
		const length = Math.round(part.seconds * SAMPLE_RATE);
		for (let i = 0; i < length; i++) {
			const t = (offset + i) / SAMPLE_RATE;
			samples[offset + i] = part.loud
				? 0.5 * Math.sin(2 * Math.PI * 220 * t)
				: 0.001 * Math.sin(2 * Math.PI * 50 * t);
		}
		offset += length;
	}
	return { samples, sampleRate: SAMPLE_RATE };
}

describe("detectSilences", () => {
	test("finds pauses between speech with padding, no padding at edges", () => {
		const audio = buildAudio({
			pattern: [
				{ seconds: 1, loud: false },
				{ seconds: 2, loud: true },
				{ seconds: 1, loud: false },
				{ seconds: 2, loud: true },
				{ seconds: 0.2, loud: false },
				{ seconds: 1, loud: true },
				{ seconds: 1, loud: false },
			],
		});
		const { ranges } = detectSilences({
			audio,
			minSilenceSeconds: 0.5,
			paddingSeconds: 0.1,
		});
		expect(ranges).toHaveLength(3);
		expect(ranges[0].start).toBe(0);
		expect(ranges[0].end).toBeCloseTo(0.9, 1);
		expect(ranges[1].start).toBeCloseTo(3.1, 1);
		expect(ranges[1].end).toBeCloseTo(3.9, 1);
		expect(ranges[2].start).toBeCloseTo(7.3, 1);
		expect(ranges[2].end).toBeCloseTo(8.2, 1);
	});

	test("returns nothing for continuous audio", () => {
		const audio = buildAudio({ pattern: [{ seconds: 3, loud: true }] });
		const { ranges } = detectSilences({
			audio,
			minSilenceSeconds: 0.5,
			paddingSeconds: 0.1,
		});
		expect(ranges).toHaveLength(0);
	});
});
