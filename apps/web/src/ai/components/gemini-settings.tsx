"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogBody,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	getGeminiApiKey,
	subscribeGeminiKey,
	setGeminiApiKey,
	geminiRequestHeaders,
} from "../credentials";

import { GeminiQuota } from "./gemini-quota";

export function GeminiSettings({ disabled = false }: { disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	const [key, setKey] = useState("");
	const activeKey = useSyncExternalStore(
		subscribeGeminiKey,
		getGeminiApiKey,
		() => "",
	);
	const configured = Boolean(activeKey);
	const [showKey, setShowKey] = useState(false);
	const [testing, setTesting] = useState(false);
	const testRequest = useRef<AbortController | null>(null);
	const [status, setStatus] = useState<{ error?: string; message?: string }>(
		{},
	);

	useEffect(() => () => testRequest.current?.abort(), []);

	function changeOpen(next: boolean) {
		if (next) {
			setKey(getGeminiApiKey());
			setShowKey(false);
			setStatus({});
		} else {
			testRequest.current?.abort();
			setTesting(false);
			setKey("");
			setShowKey(false);
		}
		setOpen(next);
	}

	async function testKey() {
		testRequest.current?.abort();
		const controller = new AbortController();
		testRequest.current = controller;
		setTesting(true);
		setStatus({});
		try {
			const response = await fetch("/api/ai/key", {
				method: "POST",
				headers: geminiRequestHeaders(key.trim()),
				signal: controller.signal,
			});
			const json = await response.json();
			if (controller.signal.aborted) return;
			setStatus(
				response.ok ? { message: json.message } : { error: json.error },
			);
		} catch {
			if (controller.signal.aborted) return;
			setStatus({
				error: "Não foi possível testar a conexão. Tente novamente.",
			});
		} finally {
			if (!controller.signal.aborted) setTesting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" aria-label="Configurar Gemini">
					<KeyRound />
					Gemini · Cota{" "}
					{configured && (
						<span
							className="size-1.5 rounded-full bg-emerald-500"
							aria-label="Chave configurada"
						/>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (testing || disabled) return;
						if (
							!key.trim() ||
							/\s/.test(key.trim()) ||
							key.trim().length > 4096
						) {
							setStatus({
								error:
									"Cole uma chave válida, sem espaços ou quebras de linha.",
							});
							return;
						}
						setGeminiApiKey(key);
						toast.success("Chave Gemini atualizada nesta aba.");
					}}
				>
					<DialogHeader>
						<DialogTitle>Configurar Gemini</DialogTitle>
						<DialogDescription>
							Troque a chave do assistente sem precisar publicar o sistema
							novamente.
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<GeminiQuota apiKey={activeKey} />
						{key.trim() !== activeKey && (
							<p className="text-xs text-amber-600">
								O painel acompanha a chave em uso. Clique em Usar chave para
								acompanhar a chave que você está digitando.
							</p>
						)}
						{disabled && (
							<p className="text-xs text-muted-foreground">
								Você pode acompanhar a cota durante a edição. Aguarde a tarefa
								terminar para trocar ou testar a chave.
							</p>
						)}
						<div className="flex flex-col gap-2">
							<Label htmlFor="gemini-api-key">Chave da API Gemini</Label>
							<Input
								id="gemini-api-key"
								type="password"
								value={key}
								onChange={(event) => {
									setKey(event.target.value);
									setStatus({});
								}}
								showPassword={showKey}
								onShowPasswordChange={setShowKey}
								autoComplete="off"
								spellCheck={false}
								maxLength={4096}
								placeholder="Cole sua chave do Google AI Studio"
								disabled={testing || disabled}
							/>
							<a
								className="text-sm underline underline-offset-4"
								href="https://aistudio.google.com/apikey"
								target="_blank"
								rel="noopener noreferrer"
							>
								Criar ou consultar uma chave no Google AI Studio
							</a>
						</div>
						<p className="text-muted-foreground text-xs">
							A chave fica nesta aba e é enviada ao Gemini pelo servidor do
							Maestro. Ela não entra na conversa nem no repositório. Sem chave
							nesta aba, o assistente usa a chave do servidor, se houver.
						</p>
						<div role="status" aria-live="polite" className="text-sm">
							{status.error && (
								<p className="text-destructive">{status.error}</p>
							)}
							{status.message && (
								<p className="text-emerald-600">{status.message}</p>
							)}
						</div>
					</DialogBody>
					<DialogFooter>
						<Button
							variant="ghost"
							disabled={!configured || testing || disabled}
							onClick={() => {
								setGeminiApiKey("");
								setKey("");
								setStatus({});
								toast.success("Chave removida desta aba.");
							}}
						>
							Remover chave
						</Button>
						<Button
							variant="outline"
							disabled={!key.trim() || testing || disabled}
							onClick={() => void testKey()}
						>
							{testing ? "Testando..." : "Testar conexão"}
						</Button>
						<Button type="submit" disabled={!key.trim() || testing || disabled}>
							Usar chave
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
