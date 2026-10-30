import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EditorCore } from "@/core";
import { generateUUID } from "@/utils/id";
import { buildUserContent, runAgent } from "./agent";
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
	messages: AiChatMessage[];
	contents: GeminiContent[];
	isRunning: boolean;
	styleReference: string;
	abortController: AbortController | null;
	setStyleReference: (value: string) => void;
	send: (params: { text: string }) => Promise<void>;
	stop: () => void;
	undoMessage: (params: { id: string }) => void;
	clear: () => void;
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
				messages: [],
				contents: [],
				isRunning: false,
				styleReference: "",
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
					set({ messages: [], contents: [], isRunning: false });
				},
			};
		},
		{
			name: "ai-chat",
			partialize: (state) => ({ styleReference: state.styleReference }),
		},
	),
);
