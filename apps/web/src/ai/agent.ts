import type { EditorCore } from "@/core";
import { describeEditorState, executeTool } from "./tools";
import {
	type AiActionLog,
	type GeminiContent,
	type GeminiPart,
	chatResponseSchema,
} from "./types";

const MAX_AGENT_STEPS = 16;

export interface AgentCallbacks {
	onText: (text: string) => void;
	onAction: (action: AiActionLog) => void;
	onProgress: (message: string | null) => void;
}

export function buildUserContent({
	editor,
	text,
}: {
	editor: EditorCore;
	text: string;
}): GeminiContent {
	const state = JSON.stringify(describeEditorState({ editor }));
	return {
		role: "user",
		parts: [{ text: `${text}\n\n[Current editor state]\n${state}` }],
	};
}

async function requestModel({
	contents,
	styleReference,
	signal,
}: {
	contents: GeminiContent[];
	styleReference?: string;
	signal: AbortSignal;
}): Promise<GeminiContent> {
	const response = await fetch("/api/ai/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ contents, styleReference }),
		signal,
	});
	const json: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			typeof json === "object" && json !== null && "error" in json
				? String(json.error)
				: response.statusText;
		throw new Error(message);
	}
	const parsed = chatResponseSchema.safeParse(json);
	if (!parsed.success) {
		throw new Error("Invalid response from the AI server");
	}
	return parsed.data.content;
}

export async function runAgent({
	editor,
	contents,
	styleReference,
	signal,
	callbacks,
}: {
	editor: EditorCore;
	contents: GeminiContent[];
	styleReference?: string;
	signal: AbortSignal;
	callbacks: AgentCallbacks;
}): Promise<GeminiContent[]> {
	const history = [...contents];

	for (let step = 0; step < MAX_AGENT_STEPS; step++) {
		callbacks.onProgress("Pensando...");
		const modelContent = await requestModel({
			contents: history,
			styleReference,
			signal,
		});
		history.push(modelContent);

		const text = modelContent.parts
			.filter((part) => part.text && !part.thought)
			.map((part) => part.text)
			.join("");
		if (text.trim()) {
			callbacks.onText(text);
		}

		const calls = modelContent.parts.filter((part) => part.functionCall);
		if (calls.length === 0) {
			break;
		}

		const responses: GeminiPart[] = [];
		for (const part of calls) {
			if (signal.aborted) {
				throw new DOMException("Aborted", "AbortError");
			}
			const call = part.functionCall;
			if (!call) continue;
			callbacks.onProgress(`Executando ${call.name}...`);
			const outcome = await executeTool({
				ctx: { editor, onProgress: (message) => callbacks.onProgress(message) },
				name: call.name,
				args: call.args ?? {},
			});
			if (call.name !== "get_timeline_state") {
				callbacks.onAction({
					name: call.name,
					summary: outcome.summary,
					ok: outcome.ok,
				});
			}
			responses.push({
				functionResponse: { name: call.name, response: outcome.result },
			});
		}
		history.push({ role: "user", parts: responses });
	}

	callbacks.onProgress(null);
	return history;
}
