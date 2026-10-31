import { describe, expect, test } from "bun:test";
import { createCanvasSurface } from "../canvas-utils";
import { renderCanvasEffect } from "../canvas-effects";

function source({ color = "rgba(200,80,20,0.5)", width = 32 } = {}) {
	const surface = createCanvasSurface({ width, height: width });
	surface.context.fillStyle = color;
	surface.context.fillRect(0, 0, width, width);
	return surface.canvas;
}
const pixel = ({
	canvas,
	x = 16,
	y = 16,
}: {
	canvas: OffscreenCanvas;
	x?: number;
	y?: number;
}) => [...canvas.getContext("2d")!.getImageData(x, y, 1, 1).data];

describe("canvas effects render real pixels", () => {
	test("grayscale changes color and retains alpha", () => {
		const original = source();
		const result = renderCanvasEffect({
			source: original,
			width: 32,
			height: 32,
			pass: { shader: "canvas-grayscale", uniforms: { u_amount: 100 } },
		});
		const [r, g, b, a] = pixel({ canvas: result });
		expect(r).toBe(g);
		expect(g).toBe(b);
		expect(a).toBeCloseTo(pixel({ canvas: original })[3], -1);
	});
	test("zero intensity leaves the source intact", () => {
		const original = source();
		expect(
			renderCanvasEffect({
				source: original,
				width: 32,
				height: 32,
				pass: { shader: "canvas-vintage", uniforms: { u_amount: 0 } },
			}),
		).toBe(original);
	});
	test("vignette darkens edges and preserves transparent pixels", () => {
		const original = source({ color: "white" });
		const result = renderCanvasEffect({
			source: original,
			width: 32,
			height: 32,
			pass: { shader: "canvas-vignette", uniforms: { u_amount: 100 } },
		});
		expect(pixel({ canvas: result, x: 0, y: 0 })[0]).toBeLessThan(
			pixel({ canvas: result })[0],
		);
		const transparent = createCanvasSurface({ width: 32, height: 32 }).canvas;
		expect(
			pixel({
				canvas: renderCanvasEffect({
					source: transparent,
					width: 32,
					height: 32,
					pass: { shader: "canvas-warm", uniforms: { u_amount: 100 } },
				}),
			})[3],
		).toBe(0);
	});
});
