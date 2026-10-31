import type { EditorCore } from "@/core";
import catalog from "./builtin-catalog.json";
import { buildElementFromMedia } from "@/timeline";
import { mediaTimeFromSeconds } from "@/wasm";

export const BUILTIN_SOUNDS = catalog;
export async function addBuiltinSound({
	editor,
	id,
	start,
	volume = -12,
}: {
	editor: EditorCore;
	id: string;
	start?: number;
	volume?: number;
}) {
	const sound = catalog.find((item) => item.id === id);
	if (!sound) throw new Error("Som não encontrado.");
	if (!Number.isFinite(volume) || volume < -60 || volume > 0)
		throw new Error("Use volume entre -60 e 0 dB.");
	if (start !== undefined && (!Number.isFinite(start) || start < 0))
		throw new Error("Posição de áudio inválida.");
	const projectId = editor.project.getActive().metadata.id;
	const sceneId = editor.scenes.getActiveScene().id;
	const startTime =
		start === undefined
			? editor.playback.getCurrentTime()
			: mediaTimeFromSeconds({ seconds: start });
	const response = await fetch(sound.url);
	if (!response.ok) throw new Error("Não foi possível carregar o som.");
	const file = new File(
		[await response.blob()],
		`Maestro - ${sound.name}.wav`,
		{ type: "audio/wav" },
	);
	const context = new AudioContext();
	let buffer: AudioBuffer;
	try {
		buffer = await context.decodeAudioData(await file.arrayBuffer());
	} finally {
		await context.close();
	}
	if (
		editor.project.getActive().metadata.id !== projectId ||
		editor.scenes.getActiveScene().id !== sceneId
	)
		throw new Error("O projeto mudou. Adicione o som novamente.");
	const url = URL.createObjectURL(file);
	const asset = await editor.media.addMediaAsset({
		projectId,
		asset: {
			name: file.name,
			type: "audio",
			file,
			url,
			duration: buffer.duration,
		},
	});
	if (!asset) {
		URL.revokeObjectURL(url);
		throw new Error("Não foi possível salvar o som no projeto.");
	}
	if (
		editor.project.getActive().metadata.id !== projectId ||
		editor.scenes.getActiveScene().id !== sceneId
	)
		throw new Error(
			"O projeto mudou. O som foi salvo na mídia do projeto original.",
		);
	const element = buildElementFromMedia({
		mediaId: asset.id,
		mediaType: "audio",
		name: sound.name,
		duration: mediaTimeFromSeconds({ seconds: buffer.duration }),
		startTime,
		buffer,
	});
	editor.timeline.insertElement({
		element: { ...element, params: { ...element.params, volume } },
		placement: { mode: "auto", trackType: "audio" },
	});
	return { id: asset.id, name: sound.name };
}
