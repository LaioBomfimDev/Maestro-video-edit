import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EditorCore } from "@/core";
import { generateUUID } from "@/utils/id";
import { buildUserContent, runAgent } from "./agent";
import { executeTool } from "./tools";
import type { AiActionLog, GeminiContent } from "./types";

export interface AiChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	actions: AiActionLog[];
	status: "running" | "done" | "error";
	progress?: string | null;
	history?: { before: number; after: number; undone?: boolean };
}

interface AiChatStore {
	projectId: string | null;
	messages: AiChatMessage[];
	contents: GeminiContent[];
	isRunning: boolean;
	styleReference: string;
	visualAnalysisEnabled: boolean;
	setVisualAnalysisEnabled: (value: boolean) => void;
	abortController: AbortController | null;
	setStyleReference: (value: string) => void;
	send: (params: { text: string }) => Promise<void>;
	runQuickAction: (params: {
		label: string;
		tool: string;
		args?: Record<string, unknown>;
	}) => Promise<void>;
	stop: () => void;
	undoMessage: (params: { id: string }) => void;
	clear: () => void;
	bindProject: (params: { projectId: string }) => void;
}

type PersistedAiChat = Pick<
	AiChatStore,
	| "projectId"
	| "messages"
	| "contents"
	| "styleReference"
	| "visualAnalysisEnabled"
>;

// Command history is in-memory, so per-reply undo ranges can't survive a reload.
function sanitizeRestoredMessages(messages: AiChatMessage[]): AiChatMessage[] {
	return messages.map((message) => ({
		...message,
		history: undefined,
		progress: null,
		status: message.status === "running" ? "error" : message.status,
		text:
			message.status === "running"
				? message.text || "Interrompido (página recarregada)."
				: message.text,
	}));
}

export const useAiChatStore = create<AiChatStore>()(
	persist(
		(set, get) => {
			const updateMessage = ({
				id,
				update,
			}: {
				id: string;
				update: (message: AiChatMessage) => Partial<AiChatMessage>;
			}) =>
				set((state) => ({
					messages: state.messages.map((message) =>
						message.id === id ? { ...message, ...update(message) } : message,
					),
				}));

			return {
				projectId: null,
				messages: [],
				contents: [],
				isRunning: false,
				styleReference: "",
				visualAnalysisEnabled: false,
				setVisualAnalysisEnabled: (value) =>
					set({ visualAnalysisEnabled: value }),
				abortController: null,

				setStyleReference: (value) => set({ styleReference: value }),

				send: async ({ text }) => {
					const trimmed = text.trim();
					if (!trimmed || get().isRunning) return;

					const editor = EditorCore.getInstance();
					const assistantId = generateUUID();
					const abortController = new AbortController();
					const historyBefore = editor.command.getHistorySize();
					const userContent = buildUserContent({ editor, text: trimmed });

					set((state) => ({
						isRunning: true,
						abortController,
						messages: [
							...state.messages,
							{
								id: generateUUID(),
								role: "user",
								text: trimmed,
								actions: [],
								status: "done",
							},
							{
								id: assistantId,
								role: "assistant",
								text: "",
								actions: [],
								status: "running",
								progress: "Pensando...",
							},
						],
					}));

					const contentsBefore = [...get().contents, userContent];
					let status: AiChatMessage["status"] = "done";
					let contentsAfter = contentsBefore;
					try {
						contentsAfter = await runAgent({
							editor,
							contents: contentsBefore,
							styleReference: get().styleReference,
							visualAnalysisEnabled: get().visualAnalysisEnabled,
							signal: abortController.signal,
							callbacks: {
								onText: (chunk) =>
									updateMessage({
										id: assistantId,
										update: (message) => ({
											text: message.text
												? `${message.text}\n\n${chunk}`
												: chunk,
										}),
									}),
								onAction: (action) =>
									updateMessage({
										id: assistantId,
										update: (message) => ({
											actions: [...message.actions, action],
										}),
									}),
								onProgress: (progress) =>
									updateMessage({
										id: assistantId,
										update: () => ({ progress }),
									}),
							},
						});
					} catch (error) {
						const aborted =
							error instanceof DOMException && error.name === "AbortError";
						status = aborted ? "done" : "error";
						const message = aborted
							? "Interrompido."
							: `Erro: ${error instanceof Error ? error.message : String(error)}`;
						updateMessage({
							id: assistantId,
							update: (current) => ({
								text: current.text ? `${current.text}\n\n${message}` : message,
							}),
						});
					}

					if (get().abortController !== abortController) return;
					const historyAfter = editor.command.getHistorySize();
					updateMessage({
						id: assistantId,
						update: () => ({
							status,
							progress: null,
							history:
								historyAfter > historyBefore
									? { before: historyBefore, after: historyAfter }
									: undefined,
						}),
					});
					set({
						isRunning: false,
						abortController: null,
						contents: status === "error" ? get().contents : contentsAfter,
					});
				},

				runQuickAction: async ({ label, tool, args = {} }) => {
					if (get().isRunning) return;
					const editor = EditorCore.getInstance();
					const assistantId = generateUUID();
					const historyBefore = editor.command.getHistorySize();
					const abortController = new AbortController();
					set((state) => ({
						abortController,
						isRunning: true,
						messages: [
							...state.messages,
							{
								id: generateUUID(),
								role: "user",
								text: label,
								actions: [],
								status: "done",
							},
							{
								id: assistantId,
								role: "assistant",
								text: "",
								actions: [],
								status: "running",
								progress: "Processando...",
							},
						],
					}));

					const outcome = await executeTool({
						ctx: {
							editor,
							signal: abortController.signal,
							visualAnalysisEnabled: get().visualAnalysisEnabled,
							onProgress: (progress) =>
								updateMessage({
									id: assistantId,
									update: () => ({ progress }),
								}),
						},
						name: tool,
						args,
					});
					if (get().abortController !== abortController) return;
					const historyAfter = editor.command.getHistorySize();
					updateMessage({
						id: assistantId,
						update: () => ({
							status: abortController.signal.aborted
								? "done"
								: outcome.ok
									? "done"
									: "error",
							text:
								typeof outcome.result.analysis === "string"
									? outcome.result.analysis
									: abortController.signal.aborted
										? "Interrompido."
										: "",
							progress: null,
							actions: [
								{ name: tool, summary: outcome.summary, ok: outcome.ok },
							],
							history:
								historyAfter > historyBefore
									? { before: historyBefore, after: historyAfter }
									: undefined,
						}),
					});
					set((state) => ({
						isRunning: false,
						abortController: null,
						contents: [
							...state.contents,
							{
								role: "user",
								parts: [
									{
										text: `[The user ran the quick action "${label}" locally (${tool}): ${outcome.summary}]${typeof outcome.result.analysis === "string" ? `\n[Visual analysis of the current frame]\n${outcome.result.analysis}` : ""}`,
									},
								],
							},
							{ role: "model", parts: [{ text: "Ok." }] },
						],
					}));
				},

				stop: () => get().abortController?.abort(),

				undoMessage: ({ id }) => {
					const message = get().messages.find((item) => item.id === id);
					const history = message?.history;
					if (!history || history.undone) return;
					const editor = EditorCore.getInstance();
					if (editor.command.getHistorySize() !== history.after) return;
					for (let i = history.after; i > history.before; i--) {
						editor.command.undo();
					}
					updateMessage({
						id,
						update: () => ({ history: { ...history, undone: true } }),
					});
					set((state) => ({
						contents: [
							...state.contents,
							{
								role: "user",
								parts: [
									{
										text: "[The user undid all edits from your previous answer.]",
									},
								],
							},
							{ role: "model", parts: [{ text: "Ok, desfeito." }] },
						],
					}));
				},

				clear: () => {
					get().abortController?.abort();
					set({
						messages: [],
						contents: [],
						isRunning: false,
						abortController: null,
					});
				},

				bindProject: ({ projectId }) => {
					if (get().projectId === projectId) return;
					get().abortController?.abort();
					set({
						projectId,
						messages: [],
						contents: [],
						isRunning: false,
						abortController: null,
					});
				},
			};
		},
		{
			name: "ai-chat",
			partialize: (state): PersistedAiChat => ({
				projectId: state.projectId,
				messages: state.messages,
				contents: state.contents,
				styleReference: state.styleReference,
				visualAnalysisEnabled: state.visualAnalysisEnabled,
			}),
			merge: (persisted, current) => {
				const restored = (persisted ?? {}) as Partial<PersistedAiChat>;
				return {
					...current,
					...restored,
					messages: sanitizeRestoredMessages(restored.messages ?? []),
				};
			},
		},
	),
);
