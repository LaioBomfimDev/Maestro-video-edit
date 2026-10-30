import type { EditorCore } from "@/core";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import {
	buildElementFromMedia,
	getElementsAtTime,
	isRetimableElement,
	isVisualElement,
} from "@/timeline";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import { buildConstantRetime } from "@/retime/presets";
import { buildSubtitleTextElement } from "@/subtitles/build-subtitle-text-element";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { extractTimelineAudio } from "@/media/mediabunny";
import { decodeAudioToFloat32 } from "@/media/audio";
import { transcriptionService } from "@/services/transcription/service";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { buildCaptionChunks } from "@/transcription/caption";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	TranscriptionLanguage,
	TranscriptionSegment,
} from "@/transcription/types";
import {
	type MediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	roundMediaTime,
} from "@/wasm";
import type { ToolResult } from "./types";

type Args = Record<string, unknown>;

export interface ToolContext {
	editor: EditorCore;
	onProgress?: (message: string) => void;
}

export interface ToolOutcome {
	result: ToolResult;
	summary: string;
	ok: boolean;
}

class ToolError extends Error {}

const MAX_TRANSCRIPT_SEGMENTS = 600;
const TIME_EPSILON_SECONDS = 0.001;

function toSeconds({ time }: { time: MediaTime }): number {
	return Math.round(mediaTimeToSeconds({ time }) * 1000) / 1000;
}

function toTime({ seconds }: { seconds: number }): MediaTime {
	return mediaTimeFromSeconds({ seconds: Math.max(0, seconds) });
}

function readNumber({
	args,
	key,
}: {
	args: Args;
	key: string;
}): number | undefined {
	const value = args[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function requireNumber({ args, key }: { args: Args; key: string }): number {
	const value = readNumber({ args, key });
	if (value === undefined) {
		throw new ToolError(`Missing numeric argument "${key}"`);
	}
	return value;
}

function readString({
	args,
	key,
}: {
	args: Args;
	key: string;
}): string | undefined {
	const value = args[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireString({ args, key }: { args: Args; key: string }): string {
	const value = readString({ args, key });
	if (value === undefined) {
		throw new ToolError(`Missing string argument "${key}"`);
	}
	return value;
}

function readBoolean({
	args,
	key,
}: {
	args: Args;
	key: string;
}): boolean | undefined {
	const value = args[key];
	return typeof value === "boolean" ? value : undefined;
}

function readStringArray({ args, key }: { args: Args; key: string }): string[] {
	const value = args[key];
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string");
}

function getTracks({ editor }: { editor: EditorCore }): SceneTracks {
	return editor.scenes.getActiveScene().tracks;
}

function getOrderedTracks({
	tracks,
}: {
	tracks: SceneTracks;
}): TimelineTrack[] {
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}

function findElement({
	editor,
	elementId,
}: {
	editor: EditorCore;
	elementId: string;
}): { track: TimelineTrack; element: TimelineElement } {
	for (const track of getOrderedTracks({ tracks: getTracks({ editor }) })) {
		const element = track.elements.find((item) => item.id === elementId);
		if (element) {
			return { track, element };
		}
	}
	throw new ToolError(`Element "${elementId}" not found`);
}

function resolveRefs({
	editor,
	elementIds,
}: {
	editor: EditorCore;
	elementIds: string[];
}): Array<{ track: TimelineTrack; element: TimelineElement }> {
	if (elementIds.length === 0) {
		throw new ToolError("No element_ids given");
	}
	return elementIds.map((elementId) => findElement({ editor, elementId }));
}

function describeElement({ element }: { element: TimelineElement }) {
	const description: Record<string, unknown> = {
		id: element.id,
		type: element.type,
		name: element.name,
		start: toSeconds({ time: element.startTime }),
		end: toSeconds({
			time: roundMediaTime({ time: element.startTime + element.duration }),
		}),
		duration: toSeconds({ time: element.duration }),
	};
	if ("mediaId" in element) {
		description.mediaId = element.mediaId;
	}
	if (element.type === "text") {
		description.content = element.params.content;
		description.fontSize = element.params.fontSize;
		description.color = element.params.color;
	}
	if (isRetimableElement(element) && element.retime) {
		description.speed = element.retime.rate;
	}
	if ("volume" in element.params) {
		description.volumeDb = element.params.volume;
		description.muted = element.params.muted ?? false;
	}
	if (isVisualElement(element) && element.hidden) {
		description.hidden = true;
	}
	return description;
}

export function describeEditorState({ editor }: { editor: EditorCore }) {
	const project = editor.project.getActive();
	const tracks = getTracks({ editor });
	const fps = project.settings.fps;

	return {
		project: {
			name: project.metadata.name,
			fps: Math.round((fps.numerator / fps.denominator) * 100) / 100,
			canvas: project.settings.canvasSize,
		},
		totalDuration: toSeconds({ time: editor.timeline.getTotalDuration() }),
		playhead: toSeconds({ time: editor.playback.getCurrentTime() }),
		selectedElementIds: editor.selection
			.getSelectedElements()
			.map((ref) => ref.elementId),
		tracks: getOrderedTracks({ tracks }).map((track) => ({
			id: track.id,
			type: track.type,
			name: track.name,
			isMain: track.id === tracks.main.id,
			...("muted" in track && track.muted ? { muted: true } : {}),
			...("hidden" in track && track.hidden ? { hidden: true } : {}),
			elements: track.elements.map((element) => describeElement({ element })),
		})),
		mediaLibrary: editor.media.getAssets().map((asset) => ({
			id: asset.id,
			name: asset.name,
			type: asset.type,
			duration: asset.duration,
			width: asset.width,
			height: asset.height,
			hasAudio: asset.hasAudio,
		})),
	};
}

let transcriptCache: {
	tracks: SceneTracks;
	language: TranscriptionLanguage;
	segments: TranscriptionSegment[];
} | null = null;

function resolveLanguage({ args }: { args: Args }): TranscriptionLanguage {
	const code = readString({ args, key: "language" })?.toLowerCase();
	const match = TRANSCRIPTION_LANGUAGES.find(
		(language) => language.code === code,
	);
	return match?.code ?? "auto";
}

async function transcribeTimeline({
	ctx,
	language,
}: {
	ctx: ToolContext;
	language: TranscriptionLanguage;
}): Promise<TranscriptionSegment[]> {
	const { editor, onProgress } = ctx;
	const tracks = getTracks({ editor });
	if (
		transcriptCache &&
		transcriptCache.tracks === tracks &&
		transcriptCache.language === language
	) {
		return transcriptCache.segments;
	}

	onProgress?.("Extraindo áudio da timeline...");
	const audioBlob = await extractTimelineAudio({
		tracks,
		mediaAssets: editor.media.getAssets(),
		totalDuration: editor.timeline.getTotalDuration(),
	});
	const { samples } = await decodeAudioToFloat32({
		audioBlob,
		sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
	});
	const result = await transcriptionService.transcribe({
		audioData: samples,
		language,
		onProgress: (progress) => {
			if (progress.status === "loading-model") {
				onProgress?.(
					`Carregando modelo de transcrição ${Math.round(progress.progress)}%`,
				);
			} else if (progress.status === "transcribing") {
				onProgress?.("Transcrevendo áudio...");
			}
		},
	});

	transcriptCache = { tracks, language, segments: result.segments };
	return result.segments;
}

function mergeRanges({
	ranges,
}: {
	ranges: Array<{ start: number; end: number }>;
}): Array<{ start: number; end: number }> {
	const sorted = ranges
		.filter((range) => range.end - range.start > TIME_EPSILON_SECONDS)
		.sort((a, b) => a.start - b.start);
	const merged: Array<{ start: number; end: number }> = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (last && range.start <= last.end + TIME_EPSILON_SECONDS) {
			last.end = Math.max(last.end, range.end);
		} else {
			merged.push({ ...range });
		}
	}
	return merged;
}

function readRanges({
	args,
}: {
	args: Args;
}): Array<{ start: number; end: number }> {
	const value = args.ranges;
	if (!Array.isArray(value)) {
		throw new ToolError('Missing "ranges"');
	}
	const ranges: Array<{ start: number; end: number }> = [];
	for (const item of value) {
		if (typeof item !== "object" || item === null) continue;
		const start: unknown = Reflect.get(item, "start");
		const end: unknown = Reflect.get(item, "end");
		if (typeof start === "number" && typeof end === "number" && end > start) {
			ranges.push({ start: Math.max(0, start), end });
		}
	}
	return mergeRanges({ ranges });
}

function elementsCrossing({
	tracks,
	time,
}: {
	tracks: SceneTracks;
	time: MediaTime;
}) {
	return getElementsAtTime({ tracks, time });
}

function removeRange({
	editor,
	start,
	end,
}: {
	editor: EditorCore;
	start: MediaTime;
	end: MediaTime;
}): void {
	const crossingStart = elementsCrossing({
		tracks: getTracks({ editor }),
		time: start,
	});
	if (crossingStart.length > 0) {
		editor.timeline.splitElements({
			elements: crossingStart,
			splitTime: start,
		});
	}
	const crossingEnd = elementsCrossing({
		tracks: getTracks({ editor }),
		time: end,
	});
	if (crossingEnd.length > 0) {
		editor.timeline.splitElements({ elements: crossingEnd, splitTime: end });
	}

	const toDelete: Array<{ trackId: string; elementId: string }> = [];
	for (const track of getOrderedTracks({ tracks: getTracks({ editor }) })) {
		for (const element of track.elements) {
			const elementEnd = element.startTime + element.duration;
			if (element.startTime >= start && elementEnd <= end) {
				toDelete.push({ trackId: track.id, elementId: element.id });
			}
		}
	}
	if (toDelete.length > 0) {
		editor.timeline.deleteElements({ elements: toDelete });
	}

	const shift = end - start;
	const moves = getOrderedTracks({ tracks: getTracks({ editor }) }).flatMap(
		(track) =>
			track.elements
				.filter((element) => element.startTime >= end)
				.map((element) => ({
					sourceTrackId: track.id,
					targetTrackId: track.id,
					elementId: element.id,
					newStartTime: roundMediaTime({ time: element.startTime - shift }),
				})),
	);
	if (moves.length > 0) {
		editor.timeline.moveElements({ moves });
	}
}

function withRippleDisabled<T>({
	editor,
	run,
}: {
	editor: EditorCore;
	run: () => T;
}): T {
	const wasRippleEnabled = editor.command.isRippleEnabled;
	editor.command.isRippleEnabled = false;
	try {
		return run();
	} finally {
		editor.command.isRippleEnabled = wasRippleEnabled;
	}
}

function formatSeconds({ seconds }: { seconds: number }): string {
	return `${seconds.toFixed(2)}s`;
}

type ToolHandler = (params: {
	ctx: ToolContext;
	args: Args;
}) => Promise<Omit<ToolOutcome, "ok">> | Omit<ToolOutcome, "ok">;

const handlers: Record<string, ToolHandler> = {
	get_timeline_state: ({ ctx }) => ({
		result: describeEditorState({ editor: ctx.editor }),
		summary: "Leu o estado da timeline",
	}),

	get_transcript: async ({ ctx, args }) => {
		const segments = await transcribeTimeline({
			ctx,
			language: resolveLanguage({ args }),
		});
		const rounded = segments
			.slice(0, MAX_TRANSCRIPT_SEGMENTS)
			.map((segment) => ({
				start: Math.round(segment.start * 100) / 100,
				end: Math.round(segment.end * 100) / 100,
				text: segment.text.trim(),
			}));
		return {
			result: {
				segments: rounded,
				truncated: segments.length > MAX_TRANSCRIPT_SEGMENTS,
			},
			summary: `Transcreveu o áudio (${segments.length} trechos)`,
		};
	},

	remove_time_ranges: ({ ctx, args }) => {
		const { editor } = ctx;
		const ranges = readRanges({ args });
		if (ranges.length === 0) {
			throw new ToolError("No valid ranges");
		}
		withRippleDisabled({
			editor,
			run: () => {
				for (const range of [...ranges].reverse()) {
					removeRange({
						editor,
						start: toTime({ seconds: range.start }),
						end: toTime({ seconds: range.end }),
					});
				}
			},
		});
		const removed = ranges.reduce(
			(total, range) => total + range.end - range.start,
			0,
		);
		return {
			result: {
				removedRanges: ranges.length,
				removedSeconds: Math.round(removed * 100) / 100,
				newTotalDuration: toSeconds({
					time: editor.timeline.getTotalDuration(),
				}),
			},
			summary: `Removeu ${ranges.length} trecho(s), ${formatSeconds({ seconds: removed })} no total`,
		};
	},

	split: ({ ctx, args }) => {
		const { editor } = ctx;
		const seconds = requireNumber({ args, key: "time" });
		const time = toTime({ seconds });
		const ids = readStringArray({ args, key: "element_ids" });
		const elements =
			ids.length > 0
				? resolveRefs({ editor, elementIds: ids }).map(
						({ track, element }) => ({
							trackId: track.id,
							elementId: element.id,
						}),
					)
				: getElementsAtTime({ tracks: getTracks({ editor }), time });
		if (elements.length === 0) {
			throw new ToolError(`No elements under ${seconds}s`);
		}
		const rightSide = editor.timeline.splitElements({
			elements,
			splitTime: time,
		});
		return {
			result: { newRightSideElementIds: rightSide.map((ref) => ref.elementId) },
			summary: `Dividiu ${elements.length} elemento(s) em ${formatSeconds({ seconds })}`,
		};
	},

	trim_element: ({ ctx, args }) => {
		const { editor } = ctx;
		const elementId = requireString({ args, key: "element_id" });
		const newStart = readNumber({ args, key: "new_start" });
		const newEnd = readNumber({ args, key: "new_end" });
		if (newStart === undefined && newEnd === undefined) {
			throw new ToolError("Provide new_start and/or new_end");
		}
		let currentId = elementId;
		if (newEnd !== undefined) {
			const { track } = findElement({ editor, elementId: currentId });
			editor.timeline.splitElements({
				elements: [{ trackId: track.id, elementId: currentId }],
				splitTime: toTime({ seconds: newEnd }),
				retainSide: "left",
			});
		}
		if (newStart !== undefined) {
			const { track } = findElement({ editor, elementId: currentId });
			const rightSide = editor.timeline.splitElements({
				elements: [{ trackId: track.id, elementId: currentId }],
				splitTime: toTime({ seconds: newStart }),
				retainSide: "right",
			});
			currentId = rightSide[0]?.elementId ?? currentId;
		}
		const { element } = findElement({ editor, elementId: currentId });
		return {
			result: { element: describeElement({ element }) },
			summary: `Aparou "${element.name}"`,
		};
	},

	delete_elements: ({ ctx, args }) => {
		const refs = resolveRefs({
			editor: ctx.editor,
			elementIds: readStringArray({ args, key: "element_ids" }),
		});
		ctx.editor.timeline.deleteElements({
			elements: refs.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
			})),
		});
		return {
			result: { deleted: refs.length },
			summary: `Apagou ${refs.length} elemento(s)`,
		};
	},

	move_element: ({ ctx, args }) => {
		const { editor } = ctx;
		const { track, element } = findElement({
			editor,
			elementId: requireString({ args, key: "element_id" }),
		});
		const newStart = requireNumber({ args, key: "new_start" });
		const targetTrackId =
			readString({ args, key: "target_track_id" }) ?? track.id;
		if (!editor.timeline.getTrackById({ trackId: targetTrackId })) {
			throw new ToolError(`Track "${targetTrackId}" not found`);
		}
		editor.timeline.moveElements({
			moves: [
				{
					sourceTrackId: track.id,
					targetTrackId,
					elementId: element.id,
					newStartTime: toTime({ seconds: newStart }),
				},
			],
		});
		return {
			result: { moved: element.id },
			summary: `Moveu "${element.name}" para ${formatSeconds({ seconds: newStart })}`,
		};
	},

	add_media: ({ ctx, args }) => {
		const { editor } = ctx;
		const mediaId = requireString({ args, key: "media_id" });
		const asset = editor.media.getAssets().find((item) => item.id === mediaId);
		if (!asset) {
			throw new ToolError(`Media "${mediaId}" not found`);
		}
		const start = readNumber({ args, key: "start" });
		editor.timeline.insertElement({
			element: buildElementFromMedia({
				mediaId: asset.id,
				mediaType: asset.type,
				name: asset.name,
				duration:
					asset.duration != null
						? mediaTimeFromSeconds({ seconds: asset.duration })
						: DEFAULT_NEW_ELEMENT_DURATION,
				startTime:
					start !== undefined
						? toTime({ seconds: start })
						: editor.playback.getCurrentTime(),
			}),
			placement: { mode: "auto" },
		});
		return {
			result: { added: asset.name },
			summary: `Adicionou "${asset.name}" à timeline`,
		};
	},

	add_text: ({ ctx, args }) => {
		const { editor } = ctx;
		const content = requireString({ args, key: "content" });
		const start = requireNumber({ args, key: "start" });
		const duration = requireNumber({ args, key: "duration" });
		const position = readString({ args, key: "position" });
		const backgroundColor = readString({ args, key: "background_color" });
		const verticalAlign =
			position === "top" || position === "bottom" ? position : "middle";
		const element = buildSubtitleTextElement({
			index: 0,
			canvasSize: editor.project.getActive().settings.canvasSize,
			caption: {
				text: content,
				startTime: Math.max(0, start),
				duration: Math.max(0.1, duration),
				style: {
					fontSize: readNumber({ args, key: "font_size" }) ?? 15,
					color: readString({ args, key: "color" }),
					fontWeight: readBoolean({ args, key: "bold" }) ? "bold" : "normal",
					background: backgroundColor
						? { enabled: true, color: backgroundColor }
						: undefined,
					placement: { verticalAlign, marginVerticalRatio: 0.08 },
				},
			},
		});
		editor.timeline.insertElement({
			element: { ...element, name: content.slice(0, 32) },
			placement: { mode: "auto", trackType: "text" },
		});
		return {
			result: { added: content },
			summary: `Adicionou texto "${content.slice(0, 40)}"`,
		};
	},

	update_text: ({ ctx, args }) => {
		const { editor } = ctx;
		const { track, element } = findElement({
			editor,
			elementId: requireString({ args, key: "element_id" }),
		});
		if (element.type !== "text") {
			throw new ToolError("Element is not a text element");
		}
		const params: Record<string, string | number> = {};
		const content = readString({ args, key: "content" });
		const fontSize = readNumber({ args, key: "font_size" });
		const color = readString({ args, key: "color" });
		const bold = readBoolean({ args, key: "bold" });
		if (content !== undefined) params.content = content;
		if (fontSize !== undefined) params.fontSize = fontSize;
		if (color !== undefined) params.color = color;
		if (bold !== undefined) params.fontWeight = bold ? "bold" : "normal";
		editor.timeline.updateElements({
			updates: [
				{ trackId: track.id, elementId: element.id, patch: { params } },
			],
		});
		return {
			result: { updated: element.id },
			summary: `Atualizou o texto "${element.name}"`,
		};
	},

	add_captions: async ({ ctx, args }) => {
		const segments = await transcribeTimeline({
			ctx,
			language: resolveLanguage({ args }),
		});
		const captions = buildCaptionChunks({ segments });
		const trackId = insertCaptionChunksAsTextTrack({
			editor: ctx.editor,
			captions,
		});
		if (!trackId) {
			throw new ToolError("No speech found to caption");
		}
		return {
			result: { captions: captions.length, trackId },
			summary: `Gerou ${captions.length} legenda(s)`,
		};
	},

	set_volume: ({ ctx, args }) => {
		const refs = resolveRefs({
			editor: ctx.editor,
			elementIds: readStringArray({ args, key: "element_ids" }),
		}).filter(({ element }) => "volume" in element.params);
		if (refs.length === 0) {
			throw new ToolError("None of the elements has audio");
		}
		const volumeDb = readNumber({ args, key: "volume_db" });
		const muted = readBoolean({ args, key: "muted" });
		const params: Record<string, number | boolean> = {};
		if (volumeDb !== undefined) {
			params.volume = Math.min(
				VOLUME_DB_MAX,
				Math.max(VOLUME_DB_MIN, volumeDb),
			);
		}
		if (muted !== undefined) params.muted = muted;
		ctx.editor.timeline.updateElements({
			updates: refs.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
				patch: { params },
			})),
		});
		return {
			result: { updated: refs.length },
			summary: `Ajustou o volume de ${refs.length} elemento(s)`,
		};
	},

	set_speed: ({ ctx, args }) => {
		const rate = requireNumber({ args, key: "rate" });
		const maintainPitch = readBoolean({ args, key: "maintain_pitch" }) ?? false;
		const refs = resolveRefs({
			editor: ctx.editor,
			elementIds: readStringArray({ args, key: "element_ids" }),
		}).filter(({ element }) => isRetimableElement(element));
		if (refs.length === 0) {
			throw new ToolError("Speed only applies to video/audio elements");
		}
		ctx.editor.timeline.updateElements({
			updates: refs.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
				patch: { retime: buildConstantRetime({ rate, maintainPitch }) },
			})),
		});
		return {
			result: { updated: refs.length },
			summary: `Velocidade ${rate}x em ${refs.length} elemento(s)`,
		};
	},

	set_opacity: ({ ctx, args }) => {
		const opacity = Math.min(
			1,
			Math.max(0, requireNumber({ args, key: "opacity" })),
		);
		const refs = resolveRefs({
			editor: ctx.editor,
			elementIds: readStringArray({ args, key: "element_ids" }),
		}).filter(({ element }) => isVisualElement(element));
		if (refs.length === 0) {
			throw new ToolError("Opacity only applies to visual elements");
		}
		ctx.editor.timeline.updateElements({
			updates: refs.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
				patch: { params: { opacity } },
			})),
		});
		return {
			result: { updated: refs.length },
			summary: `Opacidade ${Math.round(opacity * 100)}% em ${refs.length} elemento(s)`,
		};
	},

	seek: ({ ctx, args }) => {
		const seconds = requireNumber({ args, key: "time" });
		ctx.editor.playback.seek({ time: toTime({ seconds }) });
		return {
			result: { playhead: seconds },
			summary: `Playhead em ${formatSeconds({ seconds })}`,
		};
	},

	select_elements: ({ ctx, args }) => {
		const refs = resolveRefs({
			editor: ctx.editor,
			elementIds: readStringArray({ args, key: "element_ids" }),
		});
		ctx.editor.selection.setSelectedElements({
			elements: refs.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
			})),
		});
		return {
			result: { selected: refs.length },
			summary: `Selecionou ${refs.length} elemento(s)`,
		};
	},
};

export async function executeTool({
	ctx,
	name,
	args,
}: {
	ctx: ToolContext;
	name: string;
	args: Args;
}): Promise<ToolOutcome> {
	const handler = handlers[name];
	if (!handler) {
		return {
			result: { error: `Unknown tool "${name}"` },
			summary: `Ferramenta desconhecida: ${name}`,
			ok: false,
		};
	}
	try {
		const outcome = await handler({ ctx, args });
		return { ...outcome, ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			result: { error: message },
			summary: `Falhou (${name}): ${message}`,
			ok: false,
		};
	}
}
