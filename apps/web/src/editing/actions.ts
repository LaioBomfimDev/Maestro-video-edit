import type { EditorCore } from "@/core";
import type { ElementRef, TimelineElement } from "@/timeline";
import { isVisualElement } from "@/timeline";
import type { ScalarAnimationChannel } from "@/animation/types";
import { BatchCommand } from "@/commands";
import { SplitElementsCommand } from "@/commands/timeline/element/split-elements";
import { mediaTimeFromSeconds, roundMediaTime } from "@/wasm";
import { generateUUID } from "@/utils/id";
import { loadEditingEngine } from "./engine";
import { TRANSITION_PRESETS } from "./presets";

const channels = [
	"opacity",
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
] as const;
const defaults = [1, 0, 0, 1, 1, 0];

export async function applyTransition({
	editor,
	preset,
	mode,
	seconds,
	replace = false,
	elements,
}: {
	editor: EditorCore;
	preset: string;
	mode: string;
	seconds: number;
	replace?: boolean;
	elements?: ElementRef[];
}): Promise<number> {
	if (!Number.isFinite(seconds) || seconds < 0.05 || seconds > 5)
		throw new Error("Use uma duração entre 0,05 e 5 segundos.");
	const presetIndex = TRANSITION_PRESETS.findIndex((p) => p.id === preset);
	const modeIndex = ["in", "out", "both"].indexOf(mode);
	if (presetIndex < 0 || modeIndex < 0) throw new Error("Transição inválida.");
	const sceneId = editor.scenes.getActiveScene().id;
	const engine = await loadEditingEngine();
	if (editor.scenes.getActiveScene().id !== sceneId)
		throw new Error("A cena mudou. Aplique novamente.");
	const refs = editor.timeline.getElementsWithTracks({
		elements: elements ?? editor.selection.getSelectedElements(),
	});
	const targets = refs.filter(({ element }) => isVisualElement(element));
	if (!targets.length)
		throw new Error("Selecione um vídeo, imagem ou texto na timeline.");
	const { width, height } = editor.project.getActive().settings.canvasSize;
	const requested = mediaTimeFromSeconds({ seconds });
	const updates = targets.map(({ track, element }) => {
		const animations = { ...element.animations };
		channels.forEach((path, channel) => {
			const base =
				typeof element.params[path] === "number"
					? (element.params[path] as number)
					: defaults[channel];
			const extent = channel === 2 ? height : width;
			if (
				!Number.isFinite(
					engine.transition_value(
						presetIndex,
						modeIndex,
						channel,
						0,
						base,
						extent,
					),
				)
			)
				return;
			if (!replace && animations[path])
				throw new Error(
					"Este controle já tem animação. Marque a opção de substituir ou escolha outro clipe.",
				);
			const keys = new Map<number, ScalarAnimationChannel["keys"][number]>();
			for (let point = 0; point < 18; point++) {
				const time = roundMediaTime({
					time: engine.transition_time(point, element.duration, requested),
				});
				keys.set(time, {
					id: generateUUID(),
					time,
					value: engine.transition_value(
						presetIndex,
						modeIndex,
						channel,
						point,
						base,
						extent,
					),
					segmentToNext: "linear",
					tangentMode: "auto",
				});
			}
			animations[path] = { keys: [...keys.values()] };
		});
		return {
			trackId: track.id,
			elementId: element.id,
			patch: { animations } as Partial<TimelineElement>,
		};
	});
	editor.timeline.updateElements({ updates });
	return updates.length;
}

export async function cutAtIntervals({
	editor,
	seconds,
	elements,
}: {
	editor: EditorCore;
	seconds: number;
	elements?: ElementRef[];
}): Promise<number> {
	if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 60)
		throw new Error("Use um intervalo entre 0,1 e 60 segundos.");
	const sceneId = editor.scenes.getActiveScene().id;
	const engine = await loadEditingEngine();
	if (editor.scenes.getActiveScene().id !== sceneId)
		throw new Error("A cena mudou. Aplique novamente.");
	const refs = editor.timeline.getElementsWithTracks({
		elements: elements ?? editor.selection.getSelectedElements(),
	});
	if (!refs.length) throw new Error("Selecione os clipes que deseja cortar.");
	const interval = mediaTimeFromSeconds({ seconds });
	const commands: SplitElementsCommand[] = [];
	for (const { track, element } of refs) {
		const count = engine.cut_count(element.duration, interval);
		if (count < 0 || commands.length + count > 200)
			throw new Error(
				"São muitos cortes de uma vez. Aumente o intervalo (limite de 200 cortes).",
			);
		// Descending order keeps the original ID on the still-unsplit left side.
		for (let i = count; i > 0; i--)
			commands.push(
				new SplitElementsCommand({
					elements: [{ trackId: track.id, elementId: element.id }],
					splitTime: roundMediaTime({ time: element.startTime + interval * i }),
				}),
			);
	}
	if (!commands.length)
		throw new Error("Os clipes selecionados são menores que o intervalo.");
	editor.command.execute({ command: new BatchCommand(commands) });
	return commands.length;
}
