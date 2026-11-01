"use client";

import { Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	AiChat02Icon,
	ArrowUp02Icon,
	Delete02Icon,
	StopIcon,
	Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ReactMarkdownWrapper } from "@/components/ui/react-markdown-wrapper";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { type AiChatMessage, useAiChatStore } from "@/ai/chat-store";
import { GeminiSettings } from "./gemini-settings";

const SUGGESTIONS = [
	"Corte vícios de linguagem (é, tipo, né), erros e repetições",
	"Remova os silêncios de forma agressiva, estilo jump cut",
	"Crie um título de abertura nos primeiros 3 segundos",
	"Melhore as cores e a iluminação das fotos selecionadas",
	"Adicione um som de passagem entre os primeiros clipes",
	"Troque o fundo da foto selecionada por um estúdio claro, mantendo o assunto principal",
	"Prepare um Reels de até 30 segundos: cortes, título de abertura, legendas e entrada suave",
	"Crie um zoom lento nos clipes selecionados usando keyframes",
	"Revise os efeitos aplicados e reduza os que estiverem exagerados",
];

// Run locally without calling Gemini: instant and don't use API quota.
const QUICK_ACTIONS: Array<{
	label: string;
	tool: string;
	args: Record<string, unknown>;
	selection?: boolean;
}> = [
	{
		label: "Formato vertical",
		tool: "set_project_format",
		args: { width: 1080, height: 1920 },
	},
	{
		label: "Entrada suave",
		tool: "apply_transition",
		args: { preset: "fade", mode: "in", duration: 0.4 },
		selection: true,
	},
	{ label: "Remover silêncios", tool: "remove_silences", args: {} },
	{
		label: "Só pausas longas",
		tool: "remove_silences",
		args: { min_silence_seconds: 1 },
	},
	{ label: "Legendas", tool: "add_captions", args: { language: "pt" } },
];

export function AssistantView() {
	const editor = useEditor();
	const visualAnalysisEnabled = useAiChatStore(
		(state) => state.visualAnalysisEnabled,
	);
	const setVisualAnalysisEnabled = useAiChatStore(
		(state) => state.setVisualAnalysisEnabled,
	);
	const messages = useAiChatStore((state) => state.messages);
	const isRunning = useAiChatStore((state) => state.isRunning);
	const send = useAiChatStore((state) => state.send);
	const stop = useAiChatStore((state) => state.stop);
	const clear = useAiChatStore((state) => state.clear);
	const runQuickAction = useAiChatStore((state) => state.runQuickAction);
	const bindProject = useAiChatStore((state) => state.bindProject);
	const projectId = useEditor(
		(editor) => editor.project.getActiveOrNull()?.metadata.id,
	);
	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (projectId) bindProject({ projectId });
	}, [projectId, bindProject]);

	useEffect(() => {
		const element = scrollRef.current;
		if (element) {
			element.scrollTop = element.scrollHeight;
		}
	}, [messages]);

	const submit = ({ text }: { text: string }) => {
		if (!text.trim() || isRunning) return;
		setInput("");
		void send({ text });
	};

	return (
		<PanelView
			title="Assistente IA"
			scrollRef={scrollRef}
			contentClassName="pb-2"
			actions={
				<div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
					<GeminiSettings disabled={isRunning} />
					<Button
						variant={visualAnalysisEnabled ? "secondary" : "outline"}
						size="sm"
						aria-pressed={visualAnalysisEnabled}
						aria-label="Permitir análise visual"
						disabled={isRunning}
						onClick={() => setVisualAnalysisEnabled(!visualAnalysisEnabled)}
					>
						<Eye />
						Visão
					</Button>
					{messages.length > 0 && (
						<Button
							variant="ghost"
							size="icon"
							aria-label="Limpar conversa"
							onClick={clear}
						>
							<HugeiconsIcon icon={Delete02Icon} />
						</Button>
					)}
				</div>
			}
		>
			<div className="flex min-h-full flex-col">
				<div className="mb-3 rounded-md border p-2">
					<div className="flex items-center justify-between gap-2">
						<span className="text-xs font-medium">
							Análise visual do projeto
						</span>
						<span className="text-[10px] text-muted-foreground">
							{visualAnalysisEnabled
								? "Visão ativa"
								: "Ative Visão no cabeçalho"}
						</span>
					</div>
					<p className="mt-1 text-[10px] text-muted-foreground">
						Quando ativa, a IA pode enviar um quadro da prévia ao Gemini para
						avaliar a imagem. Consome a cota da chave.
					</p>
					<details className="mt-2 text-xs">
						<summary className="cursor-pointer">O que a IA já executa</summary>
						<p className="mt-2 text-muted-foreground">
							Cortes por fala ou silêncio, títulos e legendas, efeitos e cores,
							transições, posição e escala, animações por keyframes, fades de
							áudio, duplicação e formato vertical, quadrado ou horizontal. As
							edições podem ser desfeitas.
						</p>
					</details>
				</div>
				<p className="mb-2 text-[10px] text-muted-foreground">
					Pedidos de alteração do conteúdo de fotos enviam a imagem ao Gemini e
					podem consumir saldo da chave. Para comparar uma prévia antes de
					aplicar, use Imagem e cor.
				</p>
				<div className="flex flex-1 flex-col gap-3">
					{messages.length === 0 ? (
						<EmptyState onPick={(text) => submit({ text })} />
					) : (
						messages.map((message) => (
							<MessageBubble key={message.id} message={message} />
						))
					)}
				</div>
				<div className="bg-background sticky bottom-0 flex flex-col gap-2 pt-3">
					<div
						role="group"
						aria-label="Ações rápidas da IA"
						className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1"
					>
						{visualAnalysisEnabled && (
							<Button
								variant="outline"
								size="sm"
								disabled={isRunning}
								onClick={() =>
									void runQuickAction({
										label: "Analisar quadro atual",
										tool: "inspect_preview",
										args: {
											question:
												"Avalie composição, iluminação, cores e legibilidade do quadro atual e sugira melhorias concretas. Não aplique edições neste pedido.",
										},
									})
								}
							>
								Analisar quadro
							</Button>
						)}
						{QUICK_ACTIONS.map((action) => (
							<Button
								key={action.label}
								variant="outline"
								size="sm"
								className="h-6 px-2 text-xs"
								disabled={isRunning}
								onClick={() =>
									void runQuickAction({
										...action,
										args: action.selection
											? {
													...action.args,
													element_ids: editor.selection
														.getSelectedElements()
														.map((ref) => ref.elementId),
												}
											: action.args,
									})
								}
							>
								{action.label}
							</Button>
						))}
					</div>
					<StyleReference />
					<div className="relative">
						<Textarea
							value={input}
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									submit({ text: input });
								}
								event.stopPropagation();
							}}
							placeholder="Peça uma edição... (Enter envia)"
							className="min-h-[72px] pr-11"
							aria-label="Mensagem para o assistente"
						/>
						<Button
							size="icon"
							className="absolute right-2 bottom-2"
							aria-label={isRunning ? "Parar" : "Enviar"}
							onClick={() => (isRunning ? stop() : submit({ text: input }))}
							disabled={!isRunning && !input.trim()}
						>
							<HugeiconsIcon icon={isRunning ? StopIcon : ArrowUp02Icon} />
						</Button>
					</div>
				</div>
			</div>
		</PanelView>
	);
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
	return (
		<div className="flex flex-col items-center gap-3 px-1 pt-6 text-center">
			<HugeiconsIcon
				icon={AiChat02Icon}
				className="text-muted-foreground size-8"
			/>
			<p className="text-muted-foreground text-sm">
				Descreva o que você quer e a IA edita a timeline pra você. Tudo pode ser
				desfeito.
			</p>
			<div className="flex w-full flex-col gap-1.5 pt-2">
				{SUGGESTIONS.map((suggestion) => (
					<Button
						key={suggestion}
						variant="outline"
						size="sm"
						className="h-auto justify-start py-1.5 text-left whitespace-normal"
						onClick={() => onPick(suggestion)}
					>
						{suggestion}
					</Button>
				))}
			</div>
		</div>
	);
}

function MessageBubble({ message }: { message: AiChatMessage }) {
	const undoMessage = useAiChatStore((state) => state.undoMessage);
	const historySize = useEditor((editor) => editor.command.getHistorySize());
	const isUser = message.role === "user";
	const history = message.history;
	const canUndo = history && !history.undone && historySize === history.after;

	return (
		<div className={cn("flex flex-col gap-1.5", isUser && "items-end")}>
			<div
				className={cn(
					"max-w-[95%] rounded-md px-3 py-2 text-sm",
					isUser ? "bg-secondary" : "bg-accent/50 border",
				)}
			>
				{isUser ? (
					<span className="whitespace-pre-wrap">{message.text}</span>
				) : (
					<div className="flex flex-col gap-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4">
						{message.text && (
							<ReactMarkdownWrapper>{message.text}</ReactMarkdownWrapper>
						)}
						{message.actions.length > 0 && (
							<ul className="!list-none !pl-0 flex flex-col gap-1">
								{message.actions.map((action, index) => (
									<li
										key={`${action.name}-${index}`}
										className={cn(
											"text-xs",
											action.ok ? "text-muted-foreground" : "text-destructive",
										)}
									>
										{action.ok ? "✓" : "✗"} {action.summary}
									</li>
								))}
							</ul>
						)}
						{message.status === "running" && (
							<div className="text-muted-foreground flex items-center gap-2 text-xs">
								<Spinner className="size-3" />
								{message.progress ?? "Pensando..."}
							</div>
						)}
					</div>
				)}
			</div>
			{history && message.status !== "running" && (
				<Button
					variant="ghost"
					size="sm"
					className="text-muted-foreground h-6 text-xs"
					disabled={!canUndo}
					onClick={() => undoMessage({ id: message.id })}
				>
					<HugeiconsIcon icon={Undo02Icon} className="size-3" />
					{history.undone ? "Desfeito" : "Desfazer edições"}
				</Button>
			)}
		</div>
	);
}

function StyleReference() {
	const styleReference = useAiChatStore((state) => state.styleReference);
	const setStyleReference = useAiChatStore((state) => state.setStyleReference);
	const [open, setOpen] = useState(false);

	return (
		<div className="flex flex-col gap-1.5">
			<Button
				variant="text"
				size="text"
				className="text-muted-foreground justify-start text-xs"
				onClick={() => setOpen((value) => !value)}
			>
				{open ? "▾" : "▸"} Referência de estilo
				{styleReference.trim() ? " (ativa)" : ""}
			</Button>
			{open && (
				<Textarea
					value={styleReference}
					onChange={(event) => setStyleReference(event.target.value)}
					onKeyDown={(event) => event.stopPropagation()}
					placeholder="Ex.: cortes rápidos, sem pausas, legendas amarelas em negrito, título com o nome do cliente no início..."
					className="min-h-[64px] text-xs"
					aria-label="Referência de estilo"
				/>
			)}
		</div>
	);
}
