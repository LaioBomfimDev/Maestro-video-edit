import type { EffectDefinition } from "@/effects/types";

export const ADJUSTMENT_CONTROLS = [
	{ key: "exposure", label: "Exposição", min: -2, max: 2, step: 0.1 },
	{ key: "brightness", label: "Brilho", min: -100, max: 100, step: 1 },
	{ key: "contrast", label: "Contraste", min: -100, max: 100, step: 1 },
	{ key: "saturation", label: "Saturação", min: -100, max: 100, step: 1 },
	{ key: "temperature", label: "Temperatura", min: -100, max: 100, step: 1 },
	{ key: "tint", label: "Matiz verde/magenta", min: -100, max: 100, step: 1 },
] as const;
export const adjustmentEffectDefinition: EffectDefinition = {
	type: "color-adjustment",
	name: "Correção de imagem",
	keywords: ["cor", "tratamento", "exposicao", "brilho", "saturacao"],
	params: ADJUSTMENT_CONTROLS.map((control) => ({
		...control,
		type: "number",
		default: 0,
	})),
	renderer: {
		passes: [
			{
				shader: "canvas-adjustment",
				uniforms: ({ effectParams }) =>
					Object.fromEntries(
						ADJUSTMENT_CONTROLS.map((control) => [
							control.key,
							Number(effectParams[control.key] ?? 0),
						]),
					),
			},
		],
	},
};
