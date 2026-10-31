import type { EditorCore } from "@/core";
import { describeEditorState, executeTool } from "./tools";
import { recordUsageResponse } from "./usage-store";
import { getGeminiApiKey, geminiRequestHeaders } from "./credentials";
import {
	type AiActionLog,
	type GeminiContent,
	type GeminiPart,
	chatResponseSchema,
} from "./types";

const MAX_AGENT_STEPS = 12;

export interface AgentCallbacks {
	onText: (text: string) => void;
	onAction: (action: AiActionLog) => void;
	onProgress: (message: string | null) => void;
}

const STATE_MARKER = "\n\n[Current editor state]\n";
const MAX_OLD_RESPONSE_CHARS = 1500;

/**
 * Older turns don't need full editor snapshots or long tool outputs (the model
 * already acted on them), so they are shortened to keep requests small and fast.
 */
function compactHistory({
	contents,
}: {
	contents: GeminiContent[];
}): GeminiContent[] {
	let lastStateIndex = -1;
	contents.forEach((content, index) => {
		if (
			content.role === "user" &&
			content.parts.some((part) => part.text?.includes(STATE_MARKER))
		) {
			lastStateIndex = index;
		}
	});
	return contents.map((content, index) => {
		if (content.role !== "user" || index >= lastStateIndex) return content;
		return {
			...content,
			parts: content.parts.map((part) => {
				if (part.text?.includes(STATE_MARKER)) {
					return {
						...part,
						text: `${part.text.split(STATE_MARKER)[0]}\n\n[older editor state omitted]`,
					};
				}
				const response = part.functionResponse;
				if (
					response &&
					JSON.stringify(response.response).length > MAX_OLD_RESPONSE_CHARS
				) {
					const summary: Record<string, unknown> = {
						note: "Older tool output omitted; call the tool again if needed.",
					};
					for (const [key, value] of Object.entries(response.response)) {
						if (typeof value !== "object" || value === null)
							summary[key] = value;
					}
					return {
						...part,
						functionResponse: { ...response, response: summary },
					};
				}
				return part;
			}),
		};
	});
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
		parts: [{ text: `${text}${STATE_MARKER}${state}` }],
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
	const apiKey = getGeminiApiKey();
	const response = await fetch("/api/ai/chat", {
		method: "POST",
		headers: geminiRequestHeaders(apiKey),
		body: JSON.stringify({
			contents: compactHistory({ contents }),
			styleReference,
		}),
		signal,
	});
	await recordUsageResponse({ response, apiKey });
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
				ctx: {
					editor,
					signal,
					onProgress: (message) => callbacks.onProgress(message),
				},
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
