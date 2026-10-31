"use client";
import { useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { isVisualElement } from "@/timeline";
import { buildDefaultEffectInstance } from "@/effects";
import { ADJUSTMENT_CONTROLS } from "../definitions/adjustment";
import { ImageAiEditor } from "@/ai/components/image-editor";

export function AdjustmentView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const refs = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const first = refs[0]?.element;
	const effect =
		first && isVisualElement(first)
			? first.effects?.find((e) => e.type === "color-adjustment")
			: undefined;
	return (
		<PanelView title="Imagem e cor">
			<div className="p-2 pb-5 flex flex-col gap-5">
				<AdjustmentControls
					key={selectedElements.map((e) => e.elementId).join(":")}
					initial={effect?.params ?? {}}
				/>
				<ImageAiEditor
					key={`image:${selectedElements.map((e) => e.elementId).join(":")}`}
				/>
			</div>
		</PanelView>
	);
}

function AdjustmentControls({
	initial,
}: {
	initial: Record<string, number | string | boolean>;
}) {
	const editor = useEditor();
	const [values, setValues] = useState(initial);
	const [saving, setSaving] = useState(false);
	const snapshot = async () => {
		setSaving(true);
		try {
			const result = await editor.renderer.saveSnapshot();
			if (!result.success)
				throw new Error(result.error ?? "Falha ao salvar imagem.");
			toast.success("Quadro salvo como imagem PNG.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Falha ao salvar imagem.",
			);
		} finally {
			setSaving(false);
		}
	};
	const apply = (reset = false) => {
		const refs = editor.timeline
			.getElementsWithTracks({
				elements: editor.selection.getSelectedElements(),
			})
			.filter(({ element }) => isVisualElement(element));
		if (!refs.length) {
			toast.error("Selecione uma imagem ou vídeo na timeline.");
			return;
		}
		editor.timeline.updateElements({
			updates: refs.map(({ track, element }) => {
				const effects = isVisualElement(element) ? (element.effects ?? []) : [];
				const existing = effects.find((e) => e.type === "color-adjustment");
				const current =
					existing ??
					buildDefaultEffectInstance({ effectType: "color-adjustment" });
				const rest = effects.filter((e) => e.type !== "color-adjustment");
				const params = Object.fromEntries(
					ADJUSTMENT_CONTROLS.map((c) => [c.key, Number(values[c.key] ?? 0)]),
				);
				return {
					trackId: track.id,
					elementId: element.id,
					patch: {
						effects: reset
							? rest
							: existing
								? effects.map((e) =>
										e.id === current.id
											? { ...current, params, enabled: true }
											: e,
									)
								: [...effects, { ...current, params, enabled: true }],
					},
				};
			}),
		});
		if (reset) setValues({});
		toast.success(
			reset
				? "Correções removidas."
				: "Correção aplicada. Ctrl+Z para desfazer.",
		);
	};
	return (
		<section className="flex flex-col gap-3">
			<h3 className="text-sm font-medium">Tratamento de imagem</h3>
			<p className="text-xs text-muted-foreground">
				Ajuste fotos e vídeos selecionados. Os valores só entram na timeline ao
				aplicar.
			</p>
			{ADJUSTMENT_CONTROLS.map((c) => (
				<label
					key={c.key}
					className="flex flex-col gap-1 text-xs"
					htmlFor={`adjust-${c.key}`}
				>
					<span className="flex justify-between">
						{c.label}
						<span>{Number(values[c.key] ?? 0)}</span>
					</span>
					<input
						id={`adjust-${c.key}`}
						type="range"
						min={c.min}
						max={c.max}
						step={c.step}
						value={Number(values[c.key] ?? 0)}
						onChange={(e) =>
							setValues({ ...values, [c.key]: Number(e.target.value) })
						}
					/>
				</label>
			))}
			<div className="flex gap-2">
				<Button className="flex-1" onClick={() => apply()}>
					Aplicar correção
				</Button>
				<Button variant="outline" onClick={() => apply(true)}>
					Zerar
				</Button>
			</div>
			<Button
				variant="outline"
				disabled={saving}
				onClick={() => void snapshot()}
			>
				{saving ? "Salvando…" : "Baixar quadro atual como imagem"}
			</Button>
			<p className="text-[10px] text-muted-foreground">
				Salva a composição exibida no cursor, incluindo textos, filtros e
				ajustes.
			</p>
		</section>
	);
}
