import type { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import { extractTimelineAudio } from "@/media/mediabunny";
import { decodeAudioToFloat32 } from "@/media/audio";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";

import type { TimelineAudio } from "./silence-detection";

let audioCache: {
	tracks: SceneTracks;
	assetCount: number;
	audio: TimelineAudio;
} | null = null;

/** Mono mixdown of the whole timeline, cached until the tracks change. */
export async function getTimelineAudio({
	editor,
	onProgress,
}: {
	editor: EditorCore;
	onProgress?: (message: string) => void;
}): Promise<TimelineAudio> {
	const tracks = editor.scenes.getActiveScene().tracks;
	const mediaAssets = editor.media.getAssets();
	if (
		audioCache &&
		audioCache.tracks === tracks &&
		audioCache.assetCount === mediaAssets.length
	) {
		return audioCache.audio;
	}

	onProgress?.("Extraindo áudio da timeline...");
	const audioBlob = await extractTimelineAudio({
		tracks,
		mediaAssets,
		totalDuration: editor.timeline.getTotalDuration(),
	});
	const audio = await decodeAudioToFloat32({
		audioBlob,
		sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
	});
	audioCache = { tracks, assetCount: mediaAssets.length, audio };
	return audio;
}
