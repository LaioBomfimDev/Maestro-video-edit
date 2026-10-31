"use client";

import { useState } from "react";
import { Scissors, AlignLeft, AlignRight } from "lucide-react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { invokeAction } from "@/actions";
import { cutAtIntervals } from "../actions";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";

export function CutsView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const [seconds, setSeconds] = useState("2");
	const [busy, setBusy] = useState(false);
	const setTab = useAssetsPanelStore((s) => s.setActiveTab);
	const apply = async () => {
		setBusy(true);
		try {
			const count = await cutAtIntervals({ editor, seconds: Number(seconds) });
			toast.success(`${count} corte(s). Ctrl+Z desfaz o conjunto.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Falha ao cortar.");
		} finally {
			setBusy(false);
		}
	};
	return (
		<PanelView title="Cortes">
			<div className="flex flex-col gap-4 p-2 pb-5">
				<p className="text-xs text-muted-foreground">
					Posicione o cursor dentro do clipe para dividir ou aparar suas pontas.
				</p>
				<Button variant="outline" onClick={() => invokeAction("split")}>
					<Scissors />
					Dividir no cursor <kbd className="ml-auto text-xs">S</kbd>
				</Button>
				<Button variant="outline" onClick={() => invokeAction("split-left")}>
					<AlignLeft />
					Remover antes do cursor <kbd className="ml-auto text-xs">Q</kbd>
				</Button>
				<Button variant="outline" onClick={() => invokeAction("split-right")}>
					<AlignRight />
					Remover depois do cursor <kbd className="ml-auto text-xs">W</kbd>
				</Button>
				<div className="border-t pt-4 flex flex-col gap-3">
					<h3 className="text-sm font-medium">Cortes em intervalos</h3>
					<p className="text-xs text-muted-foreground">
						Divide cada clipe selecionado em trechos, preservando a ordem e a
						duração total.
					</p>
					<label htmlFor="cut-interval" className="flex flex-col gap-2 text-xs">
						Intervalo (segundos)
						<Input
							id="cut-interval"
							type="number"
							min="0.1"
							max="60"
							step="0.1"
							value={seconds}
							onChange={(e) => setSeconds(e.target.value)}
						/>
					</label>
					<div className="flex gap-1">
						{[0.5, 1, 2, 3, 5].map((s) => (
							<Button
								key={s}
								variant={Number(seconds) === s ? "secondary" : "ghost"}
								size="sm"
								onClick={() => setSeconds(String(s))}
							>
								{s}s
							</Button>
						))}
					</div>
					<Button disabled={busy || !selectedElements.length} onClick={apply}>
						{busy ? "Cortando…" : `Cortar seleção (${selectedElements.length})`}
					</Button>
				</div>
				<div className="border-t pt-4 flex flex-col gap-2">
					<h3 className="text-sm font-medium">Corte com IA</h3>
					<p className="text-xs text-muted-foreground">
						Peça ao assistente para remover pausas, montar melhores momentos ou
						ajustar o ritmo do vídeo.
					</p>
					<Button variant="outline" onClick={() => setTab("assistant")}>
						Abrir Assistente IA
					</Button>
				</div>
			</div>
		</PanelView>
	);
}
