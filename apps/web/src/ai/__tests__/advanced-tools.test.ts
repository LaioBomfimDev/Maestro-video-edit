/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Small editor fixture implements the command interfaces under test. */
import { describe, test, expect } from "bun:test";
import type { EditorCore } from "@/core";
import { createAdvancedTools } from "../advanced-tools";
import { registerDefaultEffects } from "@/effects";
import { mediaTimeFromSeconds } from "@/wasm";
import type { TimelineElement, VideoElement } from "@/timeline";
import { geminiPartSchema } from "../types";
registerDefaultEffects();
function fixture() {
	const video: VideoElement = {
		id: "clip",
		type: "video",
		name: "Video",
		mediaId: "media",
		startTime: mediaTimeFromSeconds({ seconds: 7 }),
		duration: mediaTimeFromSeconds({ seconds: 5 }),
		trimStart: mediaTimeFromSeconds({ seconds: 0 }),
		trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
		params: {
			opacity: 0.8,
			"transform.positionX": 0,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
		},
		effects: [
			{ id: "fx", type: "grayscale", enabled: true, params: { intensity: 90 } },
		],
	};
	const patches: Array<{ elementId: string; patch: Partial<TimelineElement> }> =
		[];
	const keys: Array<{
		elementId: string;
		propertyPath: string;
		time: number;
		value: unknown;
	}> = [];
	let settings: unknown;
	const editor = {
		timeline: {
			updateElements: ({ updates }: { updates: typeof patches }) => {
				patches.push(...updates);
			},
			upsertKeyframes: ({ keyframes }: { keyframes: typeof keys }) => {
				keys.push(...keyframes);
			},
			duplicateElements: () => [{ trackId: "main", elementId: "copy" }],
		},
		project: {
			updateSettings: async (args: unknown) => {
				settings = args;
			},
		},
	} as unknown as EditorCore;
	const tools = createAdvancedTools({
		resolveRefs: ({ elementIds }) =>
			elementIds.map((id) => {
				if (id !== video.id) throw new Error("Missing clip");
				return {
					element: video,
					track: {
						id: "main",
						type: "video",
						name: "Main",
						muted: false,
						hidden: false,
						elements: [video],
					},
				};
			}),
	});
	return { tools, editor, video, patches, keys, settings: () => settings };
}
describe("advanced AI editing adapters", () => {
	test("transform keeps unrelated params and uses real editor parameter coercion", async () => {
		const f = fixture();
		await f.tools.set_transform({
			ctx: { editor: f.editor },
			args: { element_ids: ["clip", "clip"], x: 80, scale_x: 1.2 },
		});
		expect(f.patches).toHaveLength(1);
		expect(f.patches[0].patch.params?.["transform.positionX"]).toBe(80);
		expect(f.patches[0].patch.params?.opacity).toBe(0.8);
	});
	test("existing animation cannot be silently replaced by static transforms", async () => {
		const f = fixture();
		f.video.animations = { "transform.scaleX": { keys: [] } };
		expect(() =>
			f.tools.set_transform({
				ctx: { editor: f.editor },
				args: { element_ids: ["clip"], scale_x: 2 },
			}),
		).toThrow("animação");
		expect(f.patches).toHaveLength(0);
	});
	test("invalid references are validated before any command", () => {
		const f = fixture();
		expect(() =>
			f.tools.set_transform({
				ctx: { editor: f.editor },
				args: { element_ids: ["clip", "missing"], x: 2 },
			}),
		).toThrow();
		expect(f.patches).toHaveLength(0);
	});
	test("animation times are clip-relative even when the clip starts at seven seconds", async () => {
		const f = fixture();
		await f.tools.animate_property({
			ctx: { editor: f.editor },
			args: {
				element_ids: ["clip"],
				property: "opacity",
				from: 0,
				to: 1,
				start: 0,
				end: 2,
			},
		});
		expect(f.keys.map((key) => key.time)).toEqual([
			mediaTimeFromSeconds({ seconds: 0 }),
			mediaTimeFromSeconds({ seconds: 2 }),
		]);
		expect(f.keys.map((key) => key.value)).toEqual([0, 1]);
	});
	test("an animation beyond clip duration leaves existing content unchanged", () => {
		const f = fixture();
		expect(() =>
			f.tools.animate_property({
				ctx: { editor: f.editor },
				args: {
					element_ids: ["clip"],
					property: "opacity",
					from: 0,
					to: 1,
					end: 6,
					replace: true,
				},
			}),
		).toThrow("duração");
		expect(f.patches).toHaveLength(0);
		expect(f.keys).toHaveLength(0);
	});
	test("effect edits retain other effect instances", async () => {
		const f = fixture();
		f.video.effects?.push({
			id: "other",
			type: "grayscale",
			enabled: false,
			params: { intensity: 10 },
		});
		await f.tools.edit_effect({
			ctx: { editor: f.editor },
			args: { element_id: "clip", effect_id: "fx", enabled: false },
		});
		expect(f.patches[0].patch.effects?.map((effect) => effect.id)).toEqual([
			"fx",
			"other",
		]);
		expect(f.patches[0].patch.effects?.[1]).toEqual(f.video.effects?.[1]);
	});
	test("unknown effect parameters are rejected instead of claiming an edit", () => {
		const f = fixture();
		expect(() =>
			f.tools.edit_effect({
				ctx: { editor: f.editor },
				args: {
					element_id: "clip",
					effect_id: "fx",
					params: [{ key: "invented_parameter", value: 10 }],
				},
			}),
		).toThrow("inexistente");
		expect(f.patches).toHaveLength(0);
	});
	test("format changes use the undoable project-settings command interface", async () => {
		const f = fixture();
		await f.tools.set_project_format({
			ctx: { editor: f.editor },
			args: { width: 1080, height: 1920 },
		});
		expect(f.settings()).toEqual({
			settings: {
				canvasSize: { width: 1080, height: 1920 },
				canvasSizeMode: "custom",
			},
		});
	});
	test("vision is opt-in and does not capture or transmit a frame while disabled", async () => {
		const f = fixture();
		await expect(
			f.tools.inspect_preview({
				ctx: { editor: f.editor },
				args: { question: "Veja o quadro" },
			}),
		).rejects.toThrow("desligada");
	});
	test("Gemini function call IDs and thought signatures survive parsing", () => {
		const part = geminiPartSchema.parse({
			thoughtSignature: "signature",
			functionCall: { name: "set_transform", id: "call-7", args: { x: 10 } },
		});
		expect(part.functionCall?.id).toBe("call-7");
		expect(part.thoughtSignature).toBe("signature");
	});
	test("removing an effect clears only that effect's animation channels", async () => {
		const f = fixture();
		f.video.animations = {
			"effects.fx.params.intensity": { keys: [] },
			"transform.rotate": { keys: [] },
		};
		await f.tools.edit_effect({
			ctx: { editor: f.editor },
			args: { element_id: "clip", effect_id: "fx", remove: true },
		});
		expect(f.patches[0].patch.effects).toEqual([]);
		expect(Object.keys(f.patches[0].patch.animations ?? {})).toEqual([
			"transform.rotate",
		]);
	});
});
