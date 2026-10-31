import type { EffectPass } from "@/effects/types";
import { createCanvasSurface } from "./canvas-utils";

export function isCanvasPass(pass: EffectPass): boolean {
	return pass.shader.startsWith("canvas-");
}

export function renderCanvasEffect({
	source,
	width,
	height,
	pass,
}: {
	source: OffscreenCanvas;
	width: number;
	height: number;
	pass: EffectPass;
}): OffscreenCanvas {
	const raw = Number(pass.uniforms.u_amount);
	const amount = Number.isFinite(raw)
		? Math.max(0, Math.min(100, raw)) / 100
		: 0;
	if (amount === 0) return source;
	const { canvas, context: ctx } = createCanvasSurface({ width, height });
	const filters: Record<string, string> = {
		"canvas-grayscale": `grayscale(${amount})`,
		"canvas-sepia": `sepia(${amount})`,
		"canvas-vivid": `saturate(${1 + amount * 2})`,
		"canvas-contrast": `contrast(${1 + amount})`,
		"canvas-brightness": `brightness(${1 + amount})`,
		"canvas-warm": `sepia(${amount * 0.45}) saturate(${1 + amount * 0.4})`,
		"canvas-cool": `saturate(${1 - amount * 0.2})`,
		"canvas-vintage": `sepia(${amount * 0.6}) saturate(${1 - amount * 0.35}) contrast(${1 - amount * 0.2}) brightness(${1 + amount * 0.1})`,
		"canvas-invert": `invert(${amount})`,
		"canvas-hue": `hue-rotate(${amount * 360}deg)`,
	};
	if (pass.shader === "canvas-pixelate") {
		const block = Math.max(1, Math.round(((2 + amount * 62) * width) / 1920));
		const smallWidth = Math.max(1, Math.ceil(width / block));
		const smallHeight = Math.max(1, Math.ceil(height / block));
		const small = createCanvasSurface({
			width: smallWidth,
			height: smallHeight,
		});
		small.context.drawImage(source, 0, 0, smallWidth, smallHeight);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(small.canvas, 0, 0, width, height);
		return canvas;
	}
	if (filters[pass.shader]) ctx.filter = filters[pass.shader];
	ctx.drawImage(source, 0, 0, width, height);
	ctx.filter = "none";
	ctx.globalCompositeOperation = "source-atop";
	if (pass.shader === "canvas-cool" || pass.shader === "canvas-warm") {
		ctx.fillStyle =
			pass.shader === "canvas-cool"
				? `rgba(40,110,255,${amount * 0.18})`
				: `rgba(255,145,30,${amount * 0.12})`;
		ctx.fillRect(0, 0, width, height);
	}
	if (pass.shader === "canvas-vignette") {
		const radius = Math.hypot(width, height) / 2;
		const gradient = ctx.createRadialGradient(
			width / 2,
			height / 2,
			radius * 0.25,
			width / 2,
			height / 2,
			radius,
		);
		gradient.addColorStop(0, "rgba(0,0,0,0)");
		gradient.addColorStop(1, `rgba(0,0,0,${amount})`);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
	}
	return canvas;
}
