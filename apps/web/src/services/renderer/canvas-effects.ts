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
	if (pass.shader === "canvas-adjustment")
		return renderAdjustment({ source, width, height, pass });
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
		"canvas-cinematic": `contrast(${1 + amount * 0.3}) saturate(${1 + amount * 0.25}) sepia(${amount * 0.2})`,
		"canvas-faded": `contrast(${1 - amount * 0.4}) saturate(${1 - amount * 0.3}) brightness(${1 + amount * 0.15})`,
		"canvas-noir": `grayscale(${amount}) contrast(${1 + amount * 0.7}) brightness(${1 - amount * 0.12})`,
		"canvas-dream": `contrast(${1 - amount * 0.15}) brightness(${1 + amount * 0.2}) saturate(${1 - amount * 0.15})`,
		"canvas-sunset": `sepia(${amount * 0.4}) saturate(${1 + amount * 0.6}) hue-rotate(-${amount * 12}deg)`,
		"canvas-arctic": `saturate(${1 - amount * 0.35}) contrast(${1 + amount * 0.15})`,
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
	if (
		["canvas-cinematic", "canvas-arctic", "canvas-sunset"].includes(pass.shader)
	) {
		ctx.fillStyle =
			pass.shader === "canvas-sunset"
				? `rgba(255,100,30,${amount * 0.12})`
				: `rgba(0,100,160,${amount * 0.12})`;
		ctx.fillRect(0, 0, width, height);
	}
	if (pass.shader === "canvas-scanlines") {
		ctx.fillStyle = `rgba(0,0,0,${amount * 0.5})`;
		const gap = Math.max(3, Math.round(height / 180));
		for (let y = 0; y < height; y += gap)
			ctx.fillRect(0, y, width, Math.max(1, gap / 3));
	}
	if (pass.shader === "canvas-grain") {
		const grain = createCanvasSurface({ width: 64, height: 64 });
		const data = grain.context.createImageData(64, 64);
		for (let i = 0; i < 64 * 64; i++) {
			const value = Math.imul(i + 1, 1103515245) >>> 24;
			data.data.set([value, value, value, 255], i * 4);
		}
		grain.context.putImageData(data, 0, 0);
		const pattern = ctx.createPattern(grain.canvas, "repeat");
		if (pattern) {
			ctx.globalAlpha = amount * 0.25;
			ctx.fillStyle = pattern;
			ctx.fillRect(0, 0, width, height);
		}
	}
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

function renderAdjustment({
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
	const value = ({ key, limit = 100 }: { key: string; limit?: number }) => {
		const raw = Number(pass.uniforms[key] ?? 0);
		return Number.isFinite(raw) ? Math.max(-limit, Math.min(limit, raw)) : 0;
	};
	const exposure = value({ key: "exposure", limit: 2 }),
		brightness = value({ key: "brightness" }),
		contrast = value({ key: "contrast" }),
		saturation = value({ key: "saturation" }),
		temperature = value({ key: "temperature" }),
		tint = value({ key: "tint" });
	if (
		![exposure, brightness, contrast, saturation, temperature, tint].some(
			Boolean,
		)
	)
		return source;
	const { canvas, context: ctx } = createCanvasSurface({ width, height });
	ctx.filter = `brightness(${2 ** exposure * (1 + brightness / 100)}) contrast(${1 + contrast / 100}) saturate(${1 + saturation / 100})`;
	ctx.drawImage(source, 0, 0, width, height);
	ctx.filter = "none";
	ctx.globalCompositeOperation = "source-atop";
	if (temperature) {
		ctx.fillStyle =
			temperature > 0
				? `rgba(255,145,35,${temperature / 500})`
				: `rgba(35,120,255,${-temperature / 500})`;
		ctx.fillRect(0, 0, width, height);
	}
	if (tint) {
		ctx.fillStyle =
			tint > 0
				? `rgba(220,55,180,${tint / 600})`
				: `rgba(55,190,90,${-tint / 600})`;
		ctx.fillRect(0, 0, width, height);
	}
	return canvas;
}
