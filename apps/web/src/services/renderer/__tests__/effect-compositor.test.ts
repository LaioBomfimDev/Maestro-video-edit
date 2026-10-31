import { expect, test } from "bun:test";
import { WasmCompositor } from "../compositor/wasm-compositor";
import { createCanvasSurface } from "../canvas-utils";
import type { FrameDescriptor, FrameItemDescriptor } from "../compositor/types";

test("clip and scene effects preserve order, preview/export frame contract and texture lifetime", () => {
	const output = createCanvasSurface({ width: 32, height: 32 });
	const textures = new Map<string, OffscreenCanvas>();
	const calls: FrameDescriptor[] = [];
	const backend = {
		initCompositor: () => {},
		resizeCompositor: () => {},
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- The headless backend uses a native Canvas in place of the browser canvas.
		getCompositorCanvas: () => output.canvas as unknown as HTMLCanvasElement,
		getLastFrameProfile: () => [],
		uploadTexture: ({
			id,
			source,
			width,
			height,
		}: {
			id: string;
			source: OffscreenCanvas;
			width: number;
			height: number;
		}) => {
			const copy = createCanvasSurface({ width, height });
			copy.context.drawImage(source, 0, 0);
			textures.set(id, copy.canvas);
		},
		releaseTexture: (id: string) => {
			textures.delete(id);
		},
		renderFrame: (frame: FrameDescriptor) => {
			calls.push(frame);
			output.context.clearRect(0, 0, 32, 32);
			for (const item of frame.items) {
				expect(item.type).toBe("layer");
				expect(item.effectPassGroups).toEqual([]); // No Canvas pass reaches Rust's shader lookup.
				if (item.type !== "layer") continue;
				const texture = textures.get(item.textureId);
				expect(texture).toBeDefined(); // Derived texture must live until the final draw.
				output.context.globalAlpha = item.opacity;
				output.context.drawImage(texture!, 0, 0);
			}
			output.context.globalAlpha = 1;
		},
	};
	const compositor = new WasmCompositor(backend);
	compositor.ensureInitialized({ width: 32, height: 32 });
	const red = createCanvasSurface({ width: 32, height: 32 });
	red.context.fillStyle = "rgb(200,0,0)";
	red.context.fillRect(0, 0, 32, 32);
	const white = createCanvasSurface({ width: 32, height: 32 });
	white.context.fillStyle = "white";
	white.context.fillRect(0, 0, 8, 32);
	compositor.syncTextures([
		{ kind: "external", id: "red", source: red.canvas, width: 32, height: 32 },
		{
			kind: "external",
			id: "white",
			source: white.canvas,
			width: 32,
			height: 32,
		},
	]);
	const layer = (textureId: string): FrameItemDescriptor => ({
		type: "layer",
		textureId,
		transform: {
			centerX: 16,
			centerY: 16,
			width: 32,
			height: 32,
			rotationDegrees: 0,
			flipX: false,
			flipY: false,
		},
		opacity: 1,
		blendMode: "normal",
		mask: null,
		effectPassGroups: [],
	});
	const redLayer = layer("red");
	redLayer.effectPassGroups = [
		[{ shader: "canvas-brightness", uniforms: { u_amount: 100 } }],
	];
	compositor.render({
		width: 32,
		height: 32,
		clear: { color: [0, 0, 0, 1] },
		items: [
			redLayer,
			{
				type: "sceneEffect",
				effectPassGroups: [
					[{ shader: "canvas-invert", uniforms: { u_amount: 100 } }],
				],
			},
			layer("white"),
		],
	});
	expect(calls).toHaveLength(2);
	expect([...output.context.getImageData(16, 16, 1, 1).data]).toEqual([
		0, 255, 255, 255,
	]);
	expect([...output.context.getImageData(2, 16, 1, 1).data]).toEqual([
		255, 255, 255, 255,
	]);
	expect([...textures.keys()].sort()).toEqual(["red", "white"]);
});
