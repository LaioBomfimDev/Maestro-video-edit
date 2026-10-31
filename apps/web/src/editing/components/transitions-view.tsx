"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { applyTransition } from "../actions";
import {
	TRANSITION_PRESETS,
	type TransitionMode,
	type TransitionPreset,
} from "../presets";
import { cn } from "@/utils/ui";

export function TransitionsView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const [seconds, setSeconds] = useState("0.5");
	const [mode, setMode] = useState<TransitionMode>("both");
	const [replace, setReplace] = useState(false);
	const [busy, setBusy] = useState(false);
	const [active, setActive] = useState<TransitionPreset>("fade");

	const apply = async () => {
		setBusy(true);
		try {
			const count = await applyTransition({
				editor,
				preset: active,
				mode,
				seconds: Number(seconds),
				replace,
			});
			toast.success(
				`Transição aplicada em ${count} clipe(s). Ctrl+Z para desfazer.`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Falha ao aplicar transição.",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<PanelView title="Transições">
			<div className="flex flex-col gap-4 p-2 pb-5">
				<p className="text-xs text-muted-foreground">
					Anime a entrada e a saída dos clipes selecionados. Entre clipes
					consecutivos, Dissolver cria uma passagem pelo fundo da cena.
				</p>
				<div className="grid grid-cols-2 gap-2">
					{TRANSITION_PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							aria-pressed={active === preset.id}
							onClick={() => setActive(preset.id)}
							className={cn(
								"rounded-lg border p-3 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
								active === preset.id && "border-primary bg-accent",
							)}
						>
							<span aria-hidden className="mb-2 block text-3xl text-primary">
								{preset.symbol}
							</span>
							<span className="text-xs font-medium">{preset.name}</span>
						</button>
					))}
				</div>
				<label className="flex flex-col gap-2 text-xs">
					Aplicar em
					<select
						className="rounded-md border bg-background p-2"
						value={mode}
						onChange={(e) => {
							const value = e.target.value;
							if (value === "in" || value === "out" || value === "both")
								setMode(value);
						}}
					>
						<option value="in">Entrada</option>
						<option value="out">Saída</option>
						<option value="both">Entrada e saída</option>
					</select>
				</label>
				<label
					htmlFor="transition-duration"
					className="flex flex-col gap-2 text-xs"
				>
					Duração de cada ponta (segundos)
					<Input
						id="transition-duration"
						type="number"
						min="0.05"
						max="5"
						step="0.05"
						value={seconds}
						onChange={(e) => setSeconds(e.target.value)}
					/>
				</label>
				<p className="text-xs text-muted-foreground">
					Em clipes curtos, a duração se ajusta à metade do clipe.
				</p>
				<label className="flex items-start gap-2 text-xs">
					<input
						type="checkbox"
						checked={replace}
						onChange={(e) => setReplace(e.target.checked)}
					/>
					Substituir animações existentes dos controles usados
				</label>
				<Button onClick={apply} disabled={busy || !selectedElements.length}>
					{busy
						? "Aplicando…"
						: `Aplicar à seleção (${selectedElements.length})`}
				</Button>
			</div>
		</PanelView>
	);
}
