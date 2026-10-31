"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Plus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { BUILTIN_SOUNDS, addBuiltinSound } from "../builtin";

export function BuiltinSoundsView() {
	const editor = useEditor();
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("Todos");
	const [playing, setPlaying] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const audio = useRef<HTMLAudioElement | null>(null);
	useEffect(
		() => () => {
			audio.current?.pause();
		},
		[],
	);
	const preview = (sound: (typeof BUILTIN_SOUNDS)[number]) => {
		const same = playing === sound.id;
		audio.current?.pause();
		setPlaying(null);
		if (same) return;
		const next = new Audio(sound.url);
		audio.current = next;
		next.volume = 0.4;
		next.onended = () => {
			if (audio.current === next) setPlaying(null);
		};
		next.onerror = () => {
			if (audio.current === next) setPlaying(null);
			toast.error("Não foi possível ouvir o som.");
		};
		setPlaying(sound.id);
		void next.play().catch(() => {
			if (audio.current === next) setPlaying(null);
		});
	};
	const add = async (id: string) => {
		setBusy(id);
		try {
			const added = await addBuiltinSound({ editor, id });
			toast.success(`${added.name} adicionado à timeline.`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Falha ao adicionar som.",
			);
		} finally {
			setBusy(null);
		}
	};
	const sounds = BUILTIN_SOUNDS.filter(
		(s) =>
			(category === "Todos" || s.category === category) &&
			`${s.name} ${s.id}`
				.toLocaleLowerCase()
				.includes(query.toLocaleLowerCase()),
	);
	return (
		<div className="flex flex-col gap-3 pb-5">
			<p className="text-xs text-muted-foreground">
				18 sons originais do Maestro. Ouça e adicione no cursor, sem chave de
				API.
			</p>
			<Input
				aria-label="Buscar sons Maestro"
				placeholder="Buscar sons…"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			<div className="flex flex-wrap gap-1">
				{["Todos", ...new Set(BUILTIN_SOUNDS.map((s) => s.category))].map(
					(c) => (
						<Button
							key={c}
							size="sm"
							variant={category === c ? "secondary" : "ghost"}
							onClick={() => setCategory(c)}
						>
							{c}
						</Button>
					),
				)}
			</div>
			{sounds.map((sound) => (
				<div
					key={sound.id}
					className="flex items-center gap-2 rounded-lg border p-2"
				>
					<Button
						size="icon"
						variant="ghost"
						aria-label={`${playing === sound.id ? "Pausar" : "Ouvir"} ${sound.name}`}
						onClick={() => preview(sound)}
					>
						{playing === sound.id ? <Pause /> : <Play />}
					</Button>
					<div className="flex-1 min-w-0">
						<p className="text-xs truncate">{sound.name}</p>
						<p className="text-[10px] text-muted-foreground">
							{sound.category} · {sound.duration}s
						</p>
					</div>
					<Button
						size="icon"
						variant="outline"
						disabled={busy !== null}
						aria-label={`Adicionar ${sound.name}`}
						onClick={() => void add(sound.id)}
					>
						<Plus />
					</Button>
				</div>
			))}
			{!sounds.length && (
				<p className="text-xs text-muted-foreground">Nenhum som encontrado.</p>
			)}
		</div>
	);
}
