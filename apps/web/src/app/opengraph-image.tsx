import { ImageResponse } from "next/og";

export const alt = "Maestro — edição de vídeo com IA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
	return new ImageResponse(
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				width: "100%",
				height: "100%",
				background: "#15151b",
				color: "#fff",
				padding: 90,
				fontFamily: "sans-serif",
			}}
		>
			<div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -5 }}>
				Maestro
			</div>
			<div style={{ fontSize: 36, color: "#c3becf", marginTop: 25 }}>
				Sua timeline. Seu assistente de IA.
			</div>
		</div>,
		size,
	);
}
