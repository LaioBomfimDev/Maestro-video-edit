export const TRANSITION_PRESETS = [
	{ id: "fade", name: "Dissolver", symbol: "◐" },
	{ id: "zoom-in", name: "Zoom suave", symbol: "⊕" },
	{ id: "zoom-out", name: "Recuar", symbol: "⊖" },
	{ id: "slide-left", name: "Da esquerda", symbol: "→" },
	{ id: "slide-right", name: "Da direita", symbol: "←" },
	{ id: "slide-up", name: "De cima", symbol: "↓" },
	{ id: "slide-down", name: "De baixo", symbol: "↑" },
	{ id: "rotate", name: "Giro suave", symbol: "↻" },
] as const;

export type TransitionPreset = (typeof TRANSITION_PRESETS)[number]["id"];
export type TransitionMode = "in" | "out" | "both";
