import type { EffectDefinition } from "@/effects/types";

// Canvas-backed passes are rendered by the same compositor in preview and export.
const presets = [
	["grayscale", "Preto e branco", "monocromatico noir black white", 100],
	["sepia", "Sépia", "antigo retro vintage", 80],
	["vivid", "Cores vivas", "saturacao vibrante saturation", 55],
	["contrast", "Contraste", "dramatico contrast", 45],
	["brightness", "Iluminar", "luz exposicao brightness", 35],
	["warm", "Luz quente", "dourado golden sunset quente", 50],
	["cool", "Luz fria", "azul blue frio", 50],
	["vintage", "Cinema retrô", "filme antigo desbotado vintage", 65],
	["invert", "Negativo", "inverter invert negativo", 100],
	["hue", "Giro de cores", "matiz hue psicodelico", 40],
	["vignette", "Vinheta", "bordas sombra vignette", 65],
	["pixelate", "Pixelização", "mosaico pixels censura", 45],
	["cinematic", "Cinema teal & orange", "cinema teal orange filme", 65],
	["faded", "Filme desbotado", "fade pastel lavado", 65],
	["noir", "Noir dramático", "preto branco drama noir", 80],
	["dream", "Sonho suave", "dream luz suave", 60],
	["sunset", "Pôr do sol", "sunset dourado", 70],
	["arctic", "Ártico", "azul gelado inverno", 65],
	["scanlines", "TV retrô", "tv linhas crt", 50],
	["grain", "Grão de filme", "granulado noise filme", 35],
] as const;

export const colorEffectDefinitions: EffectDefinition[] = presets.map(
	([type, name, keywords, amount]) => ({
		type,
		name,
		keywords: keywords.split(" "),
		params: [
			{
				key: "intensity",
				label: "Intensidade",
				type: "number",
				default: amount,
				min: 0,
				max: 100,
				step: 1,
			},
		],
		renderer: {
			passes: [
				{
					shader: `canvas-${type}`,
					uniforms: ({ effectParams }) => ({
						u_amount: Number(effectParams.intensity ?? amount),
					}),
				},
			],
		},
	}),
);
