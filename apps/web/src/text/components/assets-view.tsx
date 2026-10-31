"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { buildTextElement } from "@/timeline/element-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FontPicker } from "@/components/ui/font-picker";
import { loadFonts } from "@/fonts/google-fonts";
import { TEXT_PRESETS } from "@/text/presets";
import { cn } from "@/utils/ui";

export function TextView() {
	const editor = useEditor();
	const [active, setActive] = useState(TEXT_PRESETS[0]);
	const [font, setFont] = useState(active.font);
	const [content, setContent] = useState("");
	const [busy, setBusy] = useState(false);
	const add = async () => {
		setBusy(true);
		const sceneId = editor.scenes.getActiveScene().id;
		try {
			await loadFonts({ families: [font] });
			if (editor.scenes.getActiveScene().id !== sceneId)
				throw new Error("A cena mudou. Adicione o texto novamente.");
			const text = content.trim() || active.sample;
			const element = buildTextElement({
				raw: {
					name: text.slice(0, 32),
					params: { ...active.params, fontFamily: font, content: text },
				},
				startTime: editor.playback.getCurrentTime(),
			});
			editor.timeline.insertElement({
				element,
				placement: { mode: "auto", trackType: "text" },
			});
			toast.success(
				"Texto adicionado. Selecione-o para ajustar tamanho, posição e cor.",
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Não foi possível adicionar o texto.",
			);
		} finally {
			setBusy(false);
		}
	};
	return (
		<PanelView title="Texto e fontes">
			<div className="flex flex-col gap-4 p-2 pb-5">
				<p className="text-xs text-muted-foreground">
					Escolha um estilo pronto e personalize a fonte e o texto antes de
					adicionar.
				</p>
				<div className="grid grid-cols-2 gap-2">
					{TEXT_PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							aria-pressed={active.id === preset.id}
							onClick={() => {
								setActive(preset);
								setFont(preset.font);
							}}
							className={cn(
								"rounded-lg border p-3 text-left hover:bg-accent",
								active.id === preset.id && "border-primary bg-accent",
							)}
						>
							<span
								className="mb-3 block truncate text-lg"
								style={{
									color: String(preset.params.color),
									fontFamily: preset.font,
									fontWeight: preset.params.fontWeight === "bold" ? 700 : 400,
								}}
							>
								{preset.name}
							</span>
							<span className="block truncate text-[10px] text-muted-foreground">
								{preset.font}
							</span>
						</button>
					))}
				</div>
				<label
					htmlFor="new-text-content"
					className="flex flex-col gap-2 text-xs"
				>
					Seu texto
					<Input
						id="new-text-content"
						placeholder={active.sample}
						value={content}
						onChange={(e) => setContent(e.target.value)}
					/>
				</label>
				<div className="flex flex-col gap-2">
					<span className="text-xs">Fonte</span>
					<FontPicker defaultValue={font} onValueChange={setFont} />
				</div>
				<Button onClick={add} disabled={busy}>
					{busy ? "Carregando fonte…" : "Adicionar texto"}
				</Button>
				<p className="text-xs text-muted-foreground">
					As fontes do Google precisam de conexão para carregar. Fontes do
					sistema também estão disponíveis no seletor.
				</p>
			</div>
		</PanelView>
	);
}
