import type { ParamValues } from "@/params";

export const TEXT_PRESETS: {
	id: string;
	name: string;
	sample: string;
	font: string;
	params: ParamValues;
}[] = [
	{
		id: "plain",
		name: "Texto simples",
		sample: "Seu texto aqui",
		font: "Arial",
		params: { fontSize: 15, color: "#ffffff" },
	},
	{
		id: "impact",
		name: "Impacto",
		sample: "FAÇA ACONTECER",
		font: "Anton",
		params: {
			fontSize: 12,
			color: "#facc15",
			fontWeight: "normal",
			letterSpacing: 0.5,
		},
	},
	{
		id: "modern",
		name: "Moderno",
		sample: "Sua história começa aqui",
		font: "Montserrat",
		params: { fontSize: 7, color: "#ffffff", fontWeight: "bold" },
	},
	{
		id: "cinema",
		name: "Cinema",
		sample: "Uma nova perspectiva",
		font: "Playfair Display",
		params: {
			fontSize: 9,
			color: "#f5e6cc",
			fontWeight: "normal",
			letterSpacing: 1.5,
		},
	},
	{
		id: "subtitle",
		name: "Legenda",
		sample: "Cada momento conta.",
		font: "Roboto",
		params: {
			fontSize: 5,
			color: "#ffffff",
			fontWeight: "bold",
			"background.enabled": true,
			"background.color": "#111827",
			"background.cornerRadius": 12,
			"background.paddingX": 20,
			"background.paddingY": 12,
		},
	},
	{
		id: "retro",
		name: "Retrô",
		sample: "BONS TEMPOS",
		font: "Bebas Neue",
		params: { fontSize: 12, color: "#fb923c", letterSpacing: 2 },
	},
	{
		id: "handwritten",
		name: "Manuscrito",
		sample: "Feito com carinho",
		font: "Caveat",
		params: { fontSize: 11, color: "#fde68a" },
	},
	{
		id: "tech",
		name: "Tecnologia",
		sample: "CRIAR. EDITAR. PUBLICAR.",
		font: "Space Mono",
		params: { fontSize: 5, color: "#67e8f9", letterSpacing: 0.5 },
	},
	{
		id: "elegant",
		name: "Elegante",
		sample: "O essencial permanece",
		font: "Cormorant Garamond",
		params: { fontSize: 10, color: "#e9d5ff", letterSpacing: 1 },
	},
	{
		id: "social",
		name: "Redes sociais",
		sample: "Olha essa ideia!",
		font: "Poppins",
		params: {
			fontSize: 8,
			color: "#ffffff",
			fontWeight: "bold",
			"background.enabled": true,
			"background.color": "#7c3aed",
			"background.cornerRadius": 18,
			"background.paddingX": 24,
			"background.paddingY": 18,
		},
	},
	{
		id: "editorial",
		name: "Editorial",
		sample: "Histórias que inspiram",
		font: "Lora",
		params: { fontSize: 8, color: "#ffffff", fontStyle: "italic" },
	},
];
