"use client";

import { useState, type ReactNode } from "react";
import {
	FolderOpen,
	Type,
	Sparkles,
	Bot,
	SlidersHorizontal,
} from "lucide-react";
import { AssetsPanel } from "./panels/assets";
import { PropertiesPanel } from "./panels/properties";
import {
	useAssetsPanelStore,
	type Tab,
} from "./panels/assets/assets-panel-store";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";

export function CompactEditorLayout({
	preview,
	timeline,
}: {
	preview: ReactNode;
	timeline: ReactNode;
}) {
	const [panel, setPanel] = useState<"tools" | "properties" | null>(null);
	const setActiveTab = useAssetsPanelStore((state) => state.setActiveTab);
	const { selectedElements } = useElementSelection();
	const openTools = (tab: Tab) => {
		setActiveTab(tab);
		setPanel("tools");
	};
	return (
		<div className="compact-editor flex size-full min-h-0 flex-col">
			<div className="compact-workspace min-h-0 flex-1">
				<div className="compact-preview min-h-0 min-w-0">{preview}</div>
				<div className="compact-timeline flex min-h-0 min-w-0 flex-col">
					<p className="shrink-0 px-2 py-1 text-[10px] text-muted-foreground">
						Toque para selecionar · arraste o clipe selecionado · deslize o
						fundo para navegar
					</p>
					<div className="min-h-0 flex-1">{timeline}</div>
				</div>
			</div>
			<nav
				aria-label="Ferramentas de edição"
				className="compact-dock grid shrink-0 grid-cols-5 gap-1 border-t bg-background px-1 pt-1"
			>
				<Button variant="ghost" onClick={() => openTools("media")}>
					<FolderOpen />
					<span>Mídia</span>
				</Button>
				<Button variant="ghost" onClick={() => openTools("text")}>
					<Type />
					<span>Texto</span>
				</Button>
				<Button variant="ghost" onClick={() => openTools("effects")}>
					<Sparkles />
					<span>Efeitos</span>
				</Button>
				<Button variant="ghost" onClick={() => openTools("assistant")}>
					<Bot />
					<span>IA</span>
				</Button>
				<Button
					variant="ghost"
					onClick={() => setPanel("properties")}
					aria-label={`Propriedades${selectedElements.length ? ` · ${selectedElements.length} selecionado(s)` : ""}`}
				>
					<SlidersHorizontal />
					<span>Ajustes</span>
				</Button>
			</nav>
			<Sheet
				open={panel !== null}
				onOpenChange={(open) => {
					if (!open) setPanel(null);
				}}
			>
				<SheetContent
					side="bottom"
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						if (event.target instanceof HTMLElement) event.target.focus();
					}}
					className="compact-sheet flex min-h-0 flex-col gap-0 overflow-hidden rounded-t-xl p-0"
				>
					<SheetHeader className="compact-sheet-header shrink-0 border-b px-4 py-3 pr-16 text-left">
						<SheetTitle className="text-base">
							{panel === "properties"
								? "Ajustar seleção"
								: "Ferramentas do Maestro"}
						</SheetTitle>
						<SheetDescription className="compact-sheet-description text-xs">
							{panel === "properties"
								? "Selecione um clipe na timeline para editar suas propriedades."
								: "Deslize as categorias para ver cortes, sons, transições e configurações."}
						</SheetDescription>
					</SheetHeader>
					<div className="min-h-0 min-w-0 flex-1">
						{panel === "properties" ? <PropertiesPanel /> : <AssetsPanel />}
					</div>
					<div className="compact-sheet-footer shrink-0 border-t px-3 pt-2">
						<SheetClose asChild>
							<Button variant="secondary" className="w-full min-h-11">
								Ver resultado na timeline
							</Button>
						</SheetClose>
					</div>
				</SheetContent>
			</Sheet>
		</div>
	);
}
