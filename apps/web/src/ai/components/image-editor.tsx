"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { GeminiSettings } from "./gemini-settings";
import {
	getImageTarget,
	requestImageEdit,
	applyImageEdit,
	type ImageTarget,
} from "../image-editing";

export function ImageAiEditor() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const [prompt, setPrompt] = useState("");
	const [model, setModel] = useState("gemini-nano-banana-2.1");
	const [busy, setBusy] = useState(false);
	const [applying, setApplying] = useState(false);
	const [result, setResult] = useState<{
		blob: Blob;
		url: string;
		target: ImageTarget;
	} | null>(null);
	const controller = useRef<AbortController | null>(null);
	const resultUrl = useRef<string | null>(null);
	useEffect(
		() => () => {
			controller.current?.abort();
			if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
		},
		[],
	);
	const generate = async () => {
		let target: ImageTarget;
		try {
			target = getImageTarget({ editor });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Selecione uma foto.",
			);
			return;
		}
		const abort = new AbortController();
		controller.current = abort;
		setBusy(true);
		try {
			const blob = await requestImageEdit({
				target,
				prompt,
				model,
				signal: abort.signal,
			});
			if (abort.signal.aborted) return;
			if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
			const url = URL.createObjectURL(blob);
			resultUrl.current = url;
			setResult({ blob, url, target });
		} catch (error) {
			if (!abort.signal.aborted)
				toast.error(
					error instanceof Error ? error.message : "Falha ao editar foto.",
				);
		} finally {
			if (controller.current === abort) {
				controller.current = null;
				setBusy(false);
			}
		}
	};
	const apply = async () => {
		if (!result) return;
		setApplying(true);
		try {
			await applyImageEdit({
				editor,
				target: result.target,
				blob: result.blob,
			});
			toast.success(
				"Foto editada aplicada. O original permanece na mídia; Ctrl+Z restaura o clipe.",
			);
			setResult(null);
			if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
			resultUrl.current = null;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Falha ao aplicar imagem.",
			);
		} finally {
			setApplying(false);
		}
	};
	return (
		<section className="flex flex-col gap-3 border-t pt-4">
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-sm font-medium">Editar foto com IA</h3>
				<GeminiSettings disabled={busy || applying} />
			</div>
			<p className="text-xs text-muted-foreground">
				Selecione uma foto e descreva o que deseja mudar: fundo, objetos, estilo
				ou restauração. Uma cópia de até 1600 px da foto será enviada ao Google
				e a geração pode consumir saldo da sua chave.
			</p>
			<label htmlFor="image-model" className="text-xs">
				Modelo
			</label>
			<select
				id="image-model"
				className="rounded border bg-background p-2 text-xs"
				value={model}
				onChange={(e) => setModel(e.target.value)}
				disabled={busy}
			>
				<option value="gemini-nano-banana-2.1">Nano Banana 2.1</option>
				<option value="gemini-3.1-flash-lite-image">Nano Banana 2 Lite</option>
			</select>
			<Textarea
				aria-label="Pedido para editar a foto"
				placeholder="Ex.: troque o fundo por um estúdio claro e mantenha a pessoa…"
				value={prompt}
				maxLength={4000}
				onChange={(e) => setPrompt(e.target.value)}
				disabled={busy}
			/>
			<div className="flex flex-wrap gap-1">
				{[
					"Melhore a iluminação e as cores, preservando os detalhes.",
					"Restaure esta foto antiga, reduzindo manchas e riscos.",
					"Troque o fundo por um estúdio neutro, preservando o assunto principal.",
				].map((p, i) => (
					<Button
						key={p}
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={() => setPrompt(p)}
					>
						{["Iluminação", "Restaurar", "Fundo de estúdio"][i]}
					</Button>
				))}
			</div>
			<Button
				disabled={
					busy ||
					applying ||
					selectedElements.length !== 1 ||
					prompt.trim().length < 3
				}
				onClick={() => void generate()}
			>
				{busy ? "Gerando prévia…" : "Gerar prévia da edição"}
			</Button>
			{busy && (
				<Button variant="outline" onClick={() => controller.current?.abort()}>
					Cancelar espera
				</Button>
			)}
			{result && (
				<div className="flex flex-col gap-2">
					<Image
						src={result.url}
						alt="Prévia da foto editada com IA"
						width={512}
						height={512}
						unoptimized
						className="w-full h-auto rounded-lg"
					/>
					<p className="text-xs text-muted-foreground">
						Confira a prévia antes de usar. A IA pode alterar detalhes da foto.
					</p>
					<Button disabled={busy || applying} onClick={() => void apply()}>
						{applying ? "Salvando…" : "Usar versão editada no clipe"}
					</Button>
					<a
						className="text-xs underline text-center"
						href={result.url}
						download="maestro-foto-editada.webp"
					>
						Baixar imagem editada
					</a>
				</div>
			)}
		</section>
	);
}
