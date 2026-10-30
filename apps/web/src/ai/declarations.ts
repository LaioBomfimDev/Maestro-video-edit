const time = (description: string) => ({ type: "number", description });

const elementIds = {
	type: "array",
	items: { type: "string" },
	description: "IDs of timeline elements (from the editor state).",
};

export const AI_TOOL_DECLARATIONS = [
	{
		name: "get_timeline_state",
		description:
			"Returns the current project, tracks, elements, media library, playhead and selection. Call it again after edits if you need fresh IDs or times.",
		parameters: { type: "object", properties: {} },
	},
	{
		name: "get_transcript",
		description:
			"Transcribes the timeline audio locally (Whisper) and returns timestamped segments in timeline seconds. Use it only for content-aware edits that depend on what is said: filler words, mistakes, retakes, picking highlights. Do NOT use it just to remove silences (use remove_silences). Slow the first time.",
		parameters: {
			type: "object",
			properties: {
				language: {
					type: "string",
					description:
						"ISO 639-1 language code (e.g. 'pt', 'en'). Omit to auto-detect.",
				},
			},
		},
	},
	{
		name: "remove_time_ranges",
		description:
			"Cuts the given time ranges out of the whole timeline (all tracks) and closes the gaps, shifting later content left. Best tool for removing silences, mistakes or unwanted parts.",
		parameters: {
			type: "object",
			properties: {
				ranges: {
					type: "array",
					items: {
						type: "object",
						properties: {
							start: time("Range start in seconds."),
							end: time("Range end in seconds."),
						},
						required: ["start", "end"],
					},
				},
			},
			required: ["ranges"],
		},
	},
	{
		name: "remove_silences",
		description:
			"Detects silent/quiet parts directly from the timeline audio (fast, no transcription) and cuts them out of all tracks, closing the gaps. Use for 'remove silences/pauses', 'tighten pacing', 'jump cut'.",
		parameters: {
			type: "object",
			properties: {
				min_silence_seconds: time(
					"Only remove silences at least this long. Default 0.5. Use ~0.3 for aggressive jump cuts, ~1.0 to only remove long pauses.",
				),
				padding_seconds: time(
					"Silence kept next to speech so cuts don't clip words. Default 0.12.",
				),
				threshold_db: {
					type: "number",
					description:
						"Loudness (dBFS) below which audio counts as silence. Omit to auto-detect from the audio (recommended).",
				},
				dry_run: {
					type: "boolean",
					description: "Only report the silences found without cutting.",
				},
			},
		},
	},
	{
		name: "keep_only_ranges",
		description:
			"Keeps only the given time ranges (in order) and removes everything else from the timeline, closing the gaps. Use to build highlight reels / short cuts from transcript segments.",
		parameters: {
			type: "object",
			properties: {
				ranges: {
					type: "array",
					items: {
						type: "object",
						properties: {
							start: time("Range start in seconds."),
							end: time("Range end in seconds."),
						},
						required: ["start", "end"],
					},
				},
			},
			required: ["ranges"],
		},
	},
	{
		name: "split",
		description:
			"Splits elements at a time. If element_ids is omitted, splits every element under that time.",
		parameters: {
			type: "object",
			properties: {
				time: time("Split time in seconds."),
				element_ids: elementIds,
			},
			required: ["time"],
		},
	},
	{
		name: "trim_element",
		description:
			"Trims an element so it starts at new_start and/or ends at new_end (timeline seconds). Content outside is discarded; no gap closing.",
		parameters: {
			type: "object",
			properties: {
				element_id: { type: "string" },
				new_start: time("New start time in seconds."),
				new_end: time("New end time in seconds."),
			},
			required: ["element_id"],
		},
	},
	{
		name: "delete_elements",
		description: "Deletes elements from the timeline (leaves a gap).",
		parameters: {
			type: "object",
			properties: { element_ids: elementIds },
			required: ["element_ids"],
		},
	},
	{
		name: "move_element",
		description:
			"Moves an element to a new start time, optionally to another compatible track.",
		parameters: {
			type: "object",
			properties: {
				element_id: { type: "string" },
				new_start: time("New start time in seconds."),
				target_track_id: { type: "string" },
			},
			required: ["element_id", "new_start"],
		},
	},
	{
		name: "add_media",
		description:
			"Adds an asset from the media library to the timeline at a start time.",
		parameters: {
			type: "object",
			properties: {
				media_id: { type: "string" },
				start: time("Start time in seconds. Defaults to the playhead."),
			},
			required: ["media_id"],
		},
	},
	{
		name: "add_text",
		description:
			"Adds a text/title element. Use for titles, lower thirds, call-to-actions, hooks.",
		parameters: {
			type: "object",
			properties: {
				content: { type: "string" },
				start: time("Start time in seconds."),
				duration: time("Duration in seconds."),
				position: {
					type: "string",
					enum: ["top", "middle", "bottom"],
				},
				font_size: {
					type: "number",
					description: "Font size in app units (default 15, captions ~5).",
				},
				color: { type: "string", description: "Hex color, e.g. #ffffff." },
				bold: { type: "boolean" },
				background_color: {
					type: "string",
					description: "Hex color for a background box. Omit for none.",
				},
			},
			required: ["content", "start", "duration"],
		},
	},
	{
		name: "update_text",
		description: "Changes content or style of an existing text element.",
		parameters: {
			type: "object",
			properties: {
				element_id: { type: "string" },
				content: { type: "string" },
				font_size: { type: "number" },
				color: { type: "string" },
				bold: { type: "boolean" },
			},
			required: ["element_id"],
		},
	},
	{
		name: "add_captions",
		description:
			"Transcribes the timeline audio and inserts automatic captions on a new text track.",
		parameters: {
			type: "object",
			properties: {
				language: {
					type: "string",
					description: "ISO 639-1 code. Omit to auto-detect.",
				},
			},
		},
	},
	{
		name: "set_volume",
		description:
			"Sets volume (in dB, -60 to 20, 0 = original) and/or mute for audio/video elements.",
		parameters: {
			type: "object",
			properties: {
				element_ids: elementIds,
				volume_db: { type: "number" },
				muted: { type: "boolean" },
			},
			required: ["element_ids"],
		},
	},
	{
		name: "set_speed",
		description:
			"Sets playback speed for video/audio elements (0.01 to 5, 1 = normal). Duration changes accordingly.",
		parameters: {
			type: "object",
			properties: {
				element_ids: elementIds,
				rate: { type: "number" },
				maintain_pitch: { type: "boolean" },
			},
			required: ["element_ids", "rate"],
		},
	},
	{
		name: "set_opacity",
		description: "Sets opacity (0 to 1) of visual elements.",
		parameters: {
			type: "object",
			properties: {
				element_ids: elementIds,
				opacity: { type: "number" },
			},
			required: ["element_ids", "opacity"],
		},
	},
	{
		name: "seek",
		description: "Moves the playhead to a time so the user can review it.",
		parameters: {
			type: "object",
			properties: { time: time("Time in seconds.") },
			required: ["time"],
		},
	},
	{
		name: "select_elements",
		description: "Selects elements in the timeline to highlight them.",
		parameters: {
			type: "object",
			properties: { element_ids: elementIds },
			required: ["element_ids"],
		},
	},
] as const;
