import type { EditorCore } from "@/core";
import { recordUsageResponse } from "./usage-store";
import { getGeminiApiKey, geminiRequestHeaders } from "./credentials";
import { processMediaAssets } from "@/media/processing";
import type { ElementRef } from "@/timeline";

export type ImageTarget = ElementRef & {
	projectId: string;
	sceneId: string;
	mediaId: string;
	file: File;
	name: string;
};
export function getImageTarget({
	editor,
	elements,
}: {
	editor: EditorCore;
	elements?: ElementRef[];
}): ImageTarget {
	const refs = editor.timeline.getElementsWithTracks({
		elements: elements ?? editor.selection.getSelectedElements(),
	});
	if (refs.length !== 1 || refs[0].element.type !== "image")
		throw new Error("Selecione uma única foto na timeline.");
	const { track, element } = refs[0];
	const asset = editor.media.getAssets().find((a) => a.id === element.mediaId);
	if (!asset) throw new Error("A imagem original não foi encontrada na mídia.");
	return {
		trackId: track.id,
		elementId: element.id,
		mediaId: asset.id,
		file: asset.file,
		name: asset.name,
		projectId: editor.project.getActive().metadata.id,
		sceneId: editor.scenes.getActiveScene().id,
	};
}

export async function requestImageEdit({
	target,
	prompt,
	model = "gemini-nano-banana-2.1",
	signal,
}: {
	target: ImageTarget;
	prompt: string;
	model?: string;
	signal?: AbortSignal;
}): Promise<Blob> {
	if (prompt.trim().length < 3 || prompt.length > 4000)
		throw new Error("Descreva a edição em 3 a 4000 caracteres.");
	const bitmap = await createImageBitmap(target.file);
	let blob: Blob;
	try {
		const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
		const canvas = new OffscreenCanvas(
			Math.max(1, Math.round(bitmap.width * ratio)),
			Math.max(1, Math.round(bitmap.height * ratio)),
		);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Seu navegador não conseguiu preparar a foto.");
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.88 });
	} finally {
		bitmap.close();
	}
	if (blob.size > 2_000_000)
		throw new Error("Esta imagem continua muito grande. Use uma versão menor.");
	const data = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string")
				resolve(reader.result.split(",")[1]);
			else reject(new Error("Falha ao ler a foto."));
		};
		reader.onerror = () => reject(new Error("Falha ao ler a foto."));
		reader.readAsDataURL(blob);
	});
	const apiKey = getGeminiApiKey();
	const response = await fetch("/api/ai/image", {
		method: "POST",
		headers: geminiRequestHeaders(apiKey),
		signal,
		body: JSON.stringify({ prompt, model, mimeType: blob.type, data }),
	});
	await recordUsageResponse({ response, apiKey });
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		throw new Error(
			typeof body === "object" &&
				body !== null &&
				"error" in body &&
				typeof body.error === "string"
				? body.error
				: "Não foi possível editar a foto.",
		);
	}
	if (!response.headers.get("Content-Type")?.startsWith("image/"))
		throw new Error("A resposta não contém uma imagem.");
	return response.blob();
}

export async function applyImageEdit({
	editor,
	target,
	blob,
	signal,
}: {
	editor: EditorCore;
	target: ImageTarget;
	blob: Blob;
	signal?: AbortSignal;
}) {
	const validate = () => {
		signal?.throwIfAborted();
		if (
			editor.project.getActive().metadata.id !== target.projectId ||
			editor.scenes.getActiveScene().id !== target.sceneId
		)
			throw new Error("Volte à cena original para usar esta imagem.");
		const current = editor.timeline.getElementsWithTracks({
			elements: [target],
		})[0]?.element;
		if (
			!current ||
			current.type !== "image" ||
			current.mediaId !== target.mediaId
		)
			throw new Error("A foto do clipe mudou. Gere uma nova edição.");
	};
	validate();
	const file = new File(
		[blob],
		`${target.name.replace(/\.[^.]+$/, "")} - IA.webp`,
		{ type: "image/webp" },
	);
	const processed = await processMediaAssets({ files: [file] });
	validate();
	if (!processed[0])
		throw new Error("Não foi possível preparar a imagem editada.");
	const asset = await editor.media.addMediaAsset({
		projectId: target.projectId,
		asset: processed[0],
	});
	if (!asset) throw new Error("Não foi possível salvar a nova imagem.");
	validate();
	editor.timeline.updateElements({
		updates: [
			{
				trackId: target.trackId,
				elementId: target.elementId,
				patch: { mediaId: asset.id },
			},
		],
	});
	return { mediaId: asset.id };
}
