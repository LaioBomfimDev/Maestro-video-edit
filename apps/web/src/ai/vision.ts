import type { EditorCore } from "@/core";
import { mediaTimeToSeconds } from "@/wasm";
import { getGeminiApiKey, geminiRequestHeaders } from "./credentials";
import { recordUsageResponse } from "./usage-store";
import { z } from "zod";

const responseSchema = z.object({
	analysis: z.string().min(1).max(16000),
	model: z.string(),
});
export async function analyzePreview({
	editor,
	question,
	signal,
}: {
	editor: EditorCore;
	question: string;
	signal?: AbortSignal;
}) {
	signal?.throwIfAborted();
	const projectId = editor.project.getActive().metadata.id;
	const sceneId = editor.scenes.getActiveScene().id;
	const frame = await editor.renderer.capturePreviewFrame({ signal });
	signal?.throwIfAborted();
	const apiKey = getGeminiApiKey();
	const time = mediaTimeToSeconds({ time: frame.time });
	const response = await fetch("/api/ai/vision", {
		method: "POST",
		headers: geminiRequestHeaders(apiKey),
		signal,
		body: JSON.stringify({
			question,
			frame: { time, mimeType: "image/jpeg", data: frame.data },
		}),
	});
	await recordUsageResponse({ response, apiKey });
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok)
		throw new Error(
			typeof body === "object" && body !== null && "error" in body
				? String(body.error)
				: "Não foi possível analisar o quadro.",
		);
	const parsed = responseSchema.parse(body);
	if (
		editor.project.getActive().metadata.id !== projectId ||
		editor.scenes.getActiveScene().id !== sceneId
	)
		throw new Error(
			"O projeto ou a cena mudou durante a análise. Analise o novo quadro antes de editar.",
		);
	return {
		...parsed,
		time,
		width: frame.width,
		height: frame.height,
		scope:
			"One rendered preview frame only; no audio or unseen frames were analyzed.",
	};
}
