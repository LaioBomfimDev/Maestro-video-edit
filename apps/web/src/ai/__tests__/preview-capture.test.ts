/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Canvas and editor fixtures expose only the browser interfaces needed for capture. */
import { afterEach, beforeEach, test, expect } from "bun:test";
import { Canvas } from "@napi-rs/canvas";
import sharp from "sharp";
import type { EditorCore } from "@/core";
import { RendererManager } from "@/core/managers/renderer-manager";
import { RootNode } from "@/services/renderer/nodes/root-node";
import { mediaTimeFromSeconds } from "@/wasm";
const previousDocument = globalThis.document;
beforeEach(() => {
	globalThis.document = {
		createElement: () => new Canvas(1, 1),
	} as unknown as Document;
});
afterEach(() => {
	if (previousDocument) globalThis.document = previousDocument;
	else Reflect.deleteProperty(globalThis, "document");
});
function fixture() {
	let sceneId = "scene";
	let playhead = mediaTimeFromSeconds({ seconds: 0 });
	const editor = {
		project: { getActive: () => ({ metadata: { id: "project" } }) },
		scenes: { getActiveScene: () => ({ id: sceneId }) },
		playback: { pause: () => {}, getCurrentTime: () => playhead },
		timeline: {
			getLastFrameTime: () => mediaTimeFromSeconds({ seconds: 9 }),
			getTotalDuration: () => mediaTimeFromSeconds({ seconds: 10 }),
		},
	} as unknown as EditorCore;
	const renderer = new RendererManager(editor);
	const node = new RootNode({ duration: 10 });
	renderer.setRenderTree({ renderTree: node });
	const canvas = new Canvas(1920, 1080);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "red";
	ctx.fillRect(0, 0, 1920, 1080);
	return {
		renderer,
		node,
		canvas: canvas as unknown as HTMLCanvasElement,
		seek: (seconds: number) => {
			playhead = mediaTimeFromSeconds({ seconds });
		},
		changeScene: () => {
			sceneId = "other";
		},
	};
}
test("capture uses the completed preview frame, scales it and returns a real JPEG", async () => {
	const f = fixture();
	const pending = f.renderer.capturePreviewFrame();
	expect(f.renderer.hasPendingPreviewCapture()).toBe(true);
	f.renderer.completePreviewCapture({
		canvas: f.canvas,
		time: 0,
		renderTree: f.node,
	});
	const frame = await pending;
	const meta = await sharp(Buffer.from(frame.data, "base64")).metadata();
	expect(meta.format).toBe("jpeg");
	expect(meta.width).toBe(960);
	expect(meta.height).toBe(540);
	expect(frame.time).toBe(0);
	expect(f.renderer.hasPendingPreviewCapture()).toBe(false);
});
test("cancelled capture releases its pending request without returning media", async () => {
	const f = fixture();
	const controller = new AbortController();
	const pending = f.renderer.capturePreviewFrame({ signal: controller.signal });
	controller.abort();
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	expect(f.renderer.hasPendingPreviewCapture()).toBe(false);
});
test("changing scenes rejects the pending frame instead of exposing another scene", async () => {
	const f = fixture();
	const pending = f.renderer.capturePreviewFrame();
	f.changeScene();
	f.renderer.completePreviewCapture({
		canvas: f.canvas,
		time: 0,
		renderTree: f.node,
	});
	await expect(pending).rejects.toThrow("cena mudou");
});
test("a render from an obsolete tree cannot satisfy a newer preview request", async () => {
	const f = fixture();
	const newNode = new RootNode({ duration: 10 });
	f.renderer.setRenderTree({ renderTree: newNode });
	const pending = f.renderer.capturePreviewFrame();
	f.renderer.completePreviewCapture({
		canvas: f.canvas,
		time: 0,
		renderTree: f.node,
	});
	expect(f.renderer.hasPendingPreviewCapture()).toBe(true);
	f.renderer.completePreviewCapture({
		canvas: f.canvas,
		time: 0,
		renderTree: newNode,
	});
	expect((await pending).time).toBe(0);
});

test("seeking then capturing waits for the requested time instead of accepting an in-flight older frame", async () => {
	const f = fixture();
	f.seek(3);
	const pending = f.renderer.capturePreviewFrame();
	f.renderer.completePreviewCapture({
		canvas: f.canvas,
		time: 0,
		renderTree: f.node,
	});
	expect(f.renderer.hasPendingPreviewCapture()).toBe(true);
	const time = mediaTimeFromSeconds({ seconds: 3 });
	f.renderer.completePreviewCapture({
		canvas: f.canvas,
		time,
		renderTree: f.node,
	});
	expect((await pending).time).toBe(time);
});
