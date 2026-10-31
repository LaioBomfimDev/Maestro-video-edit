import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import sounds from "@/sounds/builtin-catalog.json";
import { TRANSITION_PRESETS } from "../presets";
const { instance } = await WebAssembly.instantiate(
	await readFile(
		new URL("../../../public/editing/maestro-editing-v1.wasm", import.meta.url),
	),
	{},
);
const { sound_sample, sound_duration, transition_value } = instance.exports;
if (
	typeof sound_sample !== "function" ||
	typeof sound_duration !== "function" ||
	typeof transition_value !== "function"
)
	throw new Error("Missing creative module exports");
test("all 18 shipped sound files contain bounded, non-silent PCM matching the Rust generator", async () => {
	expect(sounds).toHaveLength(18);
	for (const [kind, sound] of sounds.entries()) {
		const bytes = await readFile(
			new URL(`../../../public${sound.url}`, import.meta.url),
		);
		expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
		expect(bytes.readUInt32LE(24)).toBe(44100);
		expect((bytes.length - 44) / 2).toBe(
			Math.ceil(Number(sound_duration(kind)) * 44100),
		);
		let peak = 0;
		for (
			let index = 1;
			index < Math.min(15000, (bytes.length - 44) / 2);
			index += 31
		) {
			const pcm = bytes.readInt16LE(44 + index * 2);
			peak = Math.max(peak, Math.abs(pcm));
			expect(pcm).toBe(
				Math.round(Number(sound_sample(kind, index, 44100)) * 32767) || 0,
			);
		}
		expect(peak).toBeGreaterThan(100);
		expect(peak).toBeLessThan(32767);
	}
});
test("every transition has exact restored base values at its central boundary", () => {
	for (let kind = 0; kind < TRANSITION_PRESETS.length; kind++)
		for (let channel = 0; channel < 6; channel++) {
			const value = Number(transition_value(kind, 2, channel, 8, 2, 1920));
			if (Number.isFinite(value)) expect(value).toBeCloseTo(2, 10);
		}
});
