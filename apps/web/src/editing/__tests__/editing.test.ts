/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Isolated editor fixture implements only the command interfaces exercised by this test. */
import { describe, test, expect, spyOn, afterEach } from "bun:test";
import { readFile } from "node:fs/promises";
import { EditorCore } from "@/core";
import { applyTransition, cutAtIntervals } from "../actions";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import type { SceneTracks, VideoElement, TimelineElement } from "@/timeline";
import type { Command } from "@/commands";
import { resolveNumberAtTime } from "@/animation/values";

const time = (seconds: number) => mediaTimeFromSeconds({ seconds });
const wasm = await readFile(
	new URL("../../../public/editing/maestro-editing-v1.wasm", import.meta.url),
);
// Relative to src/editing/__tests__: three levels reaches apps/web.
let restore: (() => void)[] = [];
afterEach(() => {
	for (const fn of restore.reverse()) fn();
	restore = [];
});

function fixture() {
	const video: VideoElement = {
		id: "clip",
		name: "Clip",
		type: "video",
		mediaId: "media",
		duration: time(10),
		startTime: time(3),
		trimStart: time(2),
		trimEnd: ZERO_MEDIA_TIME,
		sourceDuration: time(22),
		retime: { rate: 2 },
		params: { opacity: 0.6, "transform.scaleX": 2, "transform.scaleY": 2 },
		animations: {
			"transform.rotate": {
				keys: [
					{
						id: "rotation",
						time: ZERO_MEDIA_TIME,
						value: 15,
						segmentToNext: "linear",
						tangentMode: "auto",
					},
				],
			},
		},
	};
	let tracks: SceneTracks = {
		main: {
			id: "main",
			type: "video",
			name: "Main",
			elements: [video],
			muted: false,
			hidden: false,
		},
		overlay: [],
		audio: [],
	};
	let command: Command | undefined;
	const editor = {
		scenes: { getActiveScene: () => ({ id: "scene", tracks }) },
		project: {
			getActive: () => ({
				settings: { canvasSize: { width: 1920, height: 1080 } },
			}),
		},
		selection: {
			getSelectedElements: () => [{ trackId: "main", elementId: "clip" }],
		},
		timeline: {
			getElementsWithTracks: ({
				elements,
			}: {
				elements: { elementId: string }[];
			}) =>
				elements.flatMap((ref) =>
					tracks.main.elements
						.filter((e) => e.id === ref.elementId)
						.map((element) => ({ track: tracks.main, element })),
				),
			updateTracks: (next: SceneTracks) => {
				tracks = next;
			},
			updateElements: ({
				updates,
			}: {
				updates: { elementId: string; patch: Partial<TimelineElement> }[];
			}) => {
				tracks = {
					...tracks,
					main: {
						...tracks.main,
						elements: tracks.main.elements.map(
							(e) =>
								({
									...e,
									...updates.find((u) => u.elementId === e.id)?.patch,
								}) as VideoElement,
						),
					},
				};
			},
		},
		command: {
			execute: ({ command: next }: { command: Command }) => {
				command = next;
				next.execute();
			},
		},
	} as unknown as EditorCore;
	const singleton = spyOn(EditorCore, "getInstance").mockReturnValue(editor);
	const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(async () => new Response(wasm), {
			preconnect: globalThis.fetch.preconnect,
		}),
	);
	restore.push(
		() => singleton.mockRestore(),
		() => fetchSpy.mockRestore(),
	);
	return { editor, tracks: () => tracks, command: () => command!, video };
}

describe("editing tools through the shipped Rust module", () => {
	test("interval cuts preserve retimed footage and undo/redo together", async () => {
		const f = fixture();
		expect(await cutAtIntervals({ editor: f.editor, seconds: 2 })).toBe(4);
		const clips = [...f.tracks().main.elements].sort(
			(a, b) => a.startTime - b.startTime,
		);
		expect(clips.map((c) => c.duration)).toEqual(Array(5).fill(time(2)));
		expect(clips.map((c) => c.startTime)).toEqual([3, 5, 7, 9, 11].map(time));
		expect(clips.map((c) => c.trimStart)).toEqual([2, 6, 10, 14, 18].map(time));
		expect(clips.reduce((sum, c) => sum + c.duration, 0)).toBe(time(10));
		f.command().undo();
		expect(f.tracks().main.elements).toEqual([f.video]);
		f.command().redo();
		expect(f.tracks().main.elements).toHaveLength(5);
	});
	test("transitions preserve base values and unrelated animation", async () => {
		const f = fixture();
		await applyTransition({
			editor: f.editor,
			preset: "zoom-in",
			mode: "in",
			seconds: 0.5,
		});
		const clip = f.tracks().main.elements[0];
		expect(clip.animations?.["transform.rotate"]).toEqual(
			f.video.animations?.["transform.rotate"],
		);
		expect(
			resolveNumberAtTime({
				baseValue: 0.6,
				animations: clip.animations,
				propertyPath: "opacity",
				localTime: time(0),
			}),
		).toBe(0);
		expect(
			resolveNumberAtTime({
				baseValue: 0.6,
				animations: clip.animations,
				propertyPath: "opacity",
				localTime: time(2),
			}),
		).toBeCloseTo(0.6);
		expect(
			resolveNumberAtTime({
				baseValue: 2,
				animations: clip.animations,
				propertyPath: "transform.scaleX",
				localTime: time(2),
			}),
		).toBeCloseTo(2);
		await expect(
			applyTransition({
				editor: f.editor,
				preset: "fade",
				mode: "out",
				seconds: 1,
			}),
		).rejects.toThrow("já tem animação");
	});
	test("excessive cuts are rejected before any change", async () => {
		const f = fixture();
		f.tracks().main.elements[0].duration = time(60);
		await expect(
			cutAtIntervals({ editor: f.editor, seconds: 0.1 }),
		).rejects.toThrow("muitos cortes");
		expect(f.tracks().main.elements).toHaveLength(1);
	});
});
