import { z } from "zod";
import type { ToolContext, ToolOutcome } from "./tools";
import type { EditorCore } from "@/core";
import {
	isVisualElement,
	type TimelineElement,
	type TimelineTrack,
} from "@/timeline";
import { effectsRegistry } from "@/effects";
import { coerceParamValue } from "@/params";
import { getElementParam } from "@/params/registry";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { TRANSITION_PRESETS } from "@/editing/presets";
import { TEXT_PRESETS } from "@/text/presets";
import sounds from "@/sounds/builtin-catalog.json";
import { analyzePreview } from "./vision";
import { buildEffectParamPath } from "@/animation/effect-param-channel";

type Refs = Array<{ track: TimelineTrack; element: TimelineElement }>;
type Handler = (params: {
	ctx: ToolContext;
	args: Record<string, unknown>;
}) => Omit<ToolOutcome, "ok"> | Promise<Omit<ToolOutcome, "ok">>;
const ids = z.array(z.string().min(1)).min(1).max(100);
const scalar = z.number().finite().min(-1e6).max(1e6);
const scalarPaths = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
	"opacity",
	"volume",
] as const;
const transformSchema = z.object({
	element_ids: ids,
	x: scalar.optional(),
	y: scalar.optional(),
	scale_x: scalar.optional(),
	scale_y: scalar.optional(),
	rotation: scalar.optional(),
	replace_animation: z.boolean().default(false),
});
const animateSchema = z.object({
	element_ids: ids,
	property: z.enum(scalarPaths),
	from: scalar,
	to: scalar,
	start: scalar.min(0).default(0),
	end: scalar.positive(),
	interpolation: z.enum(["linear", "hold"]).default("linear"),
	replace: z.boolean().default(false),
});
const formatSchema = z.object({
	width: z.number().int().min(64).max(7680),
	height: z.number().int().min(64).max(7680),
	background_color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional(),
});

export function createAdvancedTools({
	resolveRefs,
}: {
	resolveRefs: (params: { editor: EditorCore; elementIds: string[] }) => Refs;
}): Record<string, Handler> {
	const targets = ({
		ctx,
		elementIds,
	}: {
		ctx: ToolContext;
		elementIds: string[];
	}) =>
		resolveRefs({ editor: ctx.editor, elementIds: [...new Set(elementIds)] });
	return {
		inspect_preview: async ({ ctx, args }) => {
			if (!ctx.visualAnalysisEnabled)
				throw new Error(
					"A análise visual está desligada. Ative Visão no painel do assistente para enviar o quadro ao Gemini.",
				);
			const { question } = z
				.object({ question: z.string().trim().min(3).max(2000) })
				.parse(args);
			ctx.onProgress?.("Capturando o quadro visível e analisando com Gemini…");
			const result = await analyzePreview({
				editor: ctx.editor,
				question,
				signal: ctx.signal,
			});
			return {
				result,
				summary: `Analisou o quadro em ${result.time.toFixed(2)}s`,
			};
		},
		get_editing_catalog: () => ({
			result: {
				effects: effectsRegistry.getAll().map(({ type, name, params }) => ({
					type,
					name,
					params: params.map((param) => ({
						key: param.key,
						type: param.type,
						default: param.default,
						...(param.type === "number"
							? { min: param.min, max: param.max }
							: {}),
					})),
				})),
				transitions: TRANSITION_PRESETS.map(({ id, name }) => ({ id, name })),
				textStyles: TEXT_PRESETS.map(({ id, name }) => ({ id, name })),
				sounds,
				animationProperties: scalarPaths,
			},
			summary:
				"Consultou efeitos, transições, fontes, sons e animações disponíveis",
		}),
		set_transform: ({ ctx, args }) => {
			const input = transformSchema.parse(args);
			const refs = targets({ ctx, elementIds: input.element_ids });
			const fields = {
				"transform.positionX": input.x,
				"transform.positionY": input.y,
				"transform.scaleX": input.scale_x,
				"transform.scaleY": input.scale_y,
				"transform.rotate": input.rotation,
			};
			const entries = Object.entries(fields).filter(
				(entry): entry is [string, number] => entry[1] !== undefined,
			);
			if (!entries.length)
				throw new Error("Informe posição, escala ou rotação.");
			const updates = refs.map(({ track, element }) => {
				if (!isVisualElement(element))
					throw new Error("Transformações exigem clipes visuais.");
				const params = { ...element.params };
				const animations = { ...element.animations };
				for (const [path, value] of entries) {
					const definition = getElementParam({ element, key: path });
					if (!definition) throw new Error(`Controle indisponível: ${path}`);
					const coerced = coerceParamValue({ param: definition, value });
					if (
						coerced === null ||
						typeof coerced !== "number" ||
						!Number.isFinite(coerced)
					)
						throw new Error(`Valor inválido: ${path}`);
					if (animations[path] && !input.replace_animation)
						throw new Error(
							`${path} já tem animação. Use animate_property ou solicite substituir a animação.`,
						);
					if (input.replace_animation) delete animations[path];
					params[path] = coerced;
				}
				return {
					trackId: track.id,
					elementId: element.id,
					patch: { params, animations },
				};
			});
			ctx.editor.timeline.updateElements({ updates });
			return {
				result: { updated: updates.length },
				summary: `Ajustou posição, escala ou rotação em ${updates.length} clipe(s)`,
			};
		},
		animate_property: ({ ctx, args }) => {
			const input = animateSchema.parse(args);
			const refs = targets({ ctx, elementIds: input.element_ids });
			if (input.end <= input.start)
				throw new Error("O fim da animação deve vir depois do início.");
			const keyframes = refs.flatMap(({ track, element }) => {
				if (input.end > mediaTimeToSeconds({ time: element.duration }))
					throw new Error(
						`A animação ultrapassa a duração de ${element.name}.`,
					);
				const target = resolveAnimationTarget({
					element,
					path: input.property,
				});
				if (!target) throw new Error(`O clipe não suporta ${input.property}.`);
				if (element.animations?.[input.property] && !input.replace)
					throw new Error(
						"Esta propriedade já tem animação. Solicite substituir para recriá-la.",
					);
				return [
					{ time: input.start, value: input.from },
					{ time: input.end, value: input.to },
				].map(({ time, value }) => {
					const coerced = target.coerceValue({ value });
					if (typeof coerced !== "number" || !Number.isFinite(coerced))
						throw new Error("Valor de animação inválido.");
					return {
						trackId: track.id,
						elementId: element.id,
						propertyPath: input.property,
						time: mediaTimeFromSeconds({ seconds: time }),
						value: coerced,
						interpolation: input.interpolation,
					};
				});
			});
			// Validate every target before changing any of them.
			if (input.replace)
				ctx.editor.timeline.updateElements({
					updates: refs.map(({ track, element }) => {
						const animations = { ...element.animations };
						delete animations[input.property];
						return {
							trackId: track.id,
							elementId: element.id,
							patch: { animations },
						};
					}),
				});
			ctx.editor.timeline.upsertKeyframes({ keyframes });
			return {
				result: { updated: refs.length, property: input.property },
				summary: `Animou ${input.property} em ${refs.length} clipe(s)`,
			};
		},
		edit_effect: ({ ctx, args }) => {
			const input = z
				.object({
					element_id: z.string(),
					effect_id: z.string(),
					enabled: z.boolean().optional(),
					remove: z.boolean().default(false),
					replace_animation: z.boolean().default(false),
					params: z
						.array(
							z.object({
								key: z.string(),
								value: z.union([scalar, z.boolean(), z.string().max(1000)]),
							}),
						)
						.max(30)
						.default([]),
				})
				.parse(args);
			const { track, element } = targets({
				ctx,
				elementIds: [input.element_id],
			})[0];
			if (!isVisualElement(element))
				throw new Error("Selecione um clipe visual.");
			const effect = element.effects?.find(
				(item) => item.id === input.effect_id,
			);
			if (!effect)
				throw new Error(
					"Este efeito não existe no clipe. Leia o estado atualizado.",
				);
			const params = { ...effect.params };
			const animations = { ...element.animations };
			for (const entry of input.params) {
				const definition = effectsRegistry
					.get(effect.type)
					.params.find((param) => param.key === entry.key);
				if (!definition)
					throw new Error(`Parâmetro de efeito inexistente: ${entry.key}`);
				const value = coerceParamValue({
					param: definition,
					value: entry.value,
				});
				if (value === null) throw new Error(`Valor inválido: ${entry.key}`);
				const path = buildEffectParamPath({
					effectId: effect.id,
					paramKey: entry.key,
				});
				if (animations[path] && !input.replace_animation)
					throw new Error(
						"Este parâmetro de efeito já tem animação. Solicite substituir a animação para ajustar o valor fixo.",
					);
				if (input.replace_animation) delete animations[path];
				params[entry.key] = value;
			}
			if (input.remove)
				for (const path of Object.keys(animations)) {
					if (path.startsWith(`effects.${effect.id}.params.`))
						delete animations[path];
				}
			if (!input.remove && input.enabled === undefined && !input.params.length)
				throw new Error("Informe parâmetros, ativação ou remoção do efeito.");
			ctx.editor.timeline.updateElements({
				updates: [
					{
						trackId: track.id,
						elementId: element.id,
						patch: {
							animations,
							effects: input.remove
								? element.effects?.filter((item) => item.id !== effect.id)
								: element.effects?.map((item) =>
										item.id === effect.id
											? {
													...effect,
													enabled: input.enabled ?? effect.enabled,
													params,
												}
											: item,
									),
						},
					},
				],
			});
			return {
				result: { effect: effect.id, removed: input.remove },
				summary: `${input.remove ? "Removeu" : "Ajustou"} o efeito ${effect.type}`,
			};
		},
		duplicate_elements: ({ ctx, args }) => {
			const input = z.object({ element_ids: ids }).parse(args);
			const refs = targets({ ctx, elementIds: input.element_ids });
			const added = ctx.editor.timeline.duplicateElements({
				elements: refs.map(({ track, element }) => ({
					trackId: track.id,
					elementId: element.id,
				})),
			});
			return {
				result: { added },
				summary: `Duplicou ${added.length} clipe(s)`,
			};
		},
		set_project_format: async ({ ctx, args }) => {
			const input = formatSchema.parse(args);
			await ctx.editor.project.updateSettings({
				settings: {
					canvasSize: { width: input.width, height: input.height },
					canvasSizeMode: "custom",
					...(input.background_color
						? { background: { type: "color", color: input.background_color } }
						: {}),
				},
			});
			return {
				result: { canvas: { width: input.width, height: input.height } },
				summary: `Alterou o formato para ${input.width} × ${input.height}`,
			};
		},
	};
}
