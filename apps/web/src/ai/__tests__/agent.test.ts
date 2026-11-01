/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Agent fixture only exposes the project/scene identity read by the agent. */
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { EditorCore } from "@/core";
import { runAgent } from "../agent";
import { executeTool } from "../tools";
const editor = {
	project: { getActive: () => ({ metadata: { id: "project" } }) },
	scenes: { getActiveScene: () => ({ id: "scene" }) },
} as unknown as EditorCore;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
beforeEach(() => {
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async () => {
				throw new Error("Unexpected request");
			},
			{ preconnect: () => {} },
		),
	);
});
afterEach(() => fetchSpy.mockRestore());
const initial = [
	{ role: "user" as const, parts: [{ text: "Revise meu projeto" }] },
];
const callbacks = {
	onText: (_text: string) => {},
	onAction: () => {},
	onProgress: () => {},
};
test("function IDs and thought signatures are echoed on subsequent model requests", async () => {
	fetchSpy
		.mockResolvedValueOnce(
			Response.json({
				content: {
					role: "model",
					parts: [
						{
							thoughtSignature: "sig",
							functionCall: {
								id: "id-1",
								name: "get_editing_catalog",
								args: {},
							},
						},
					],
				},
			}),
		)
		.mockResolvedValueOnce(
			Response.json({
				content: { role: "model", parts: [{ text: "Catálogo consultado." }] },
			}),
		);
	await runAgent({
		editor,
		contents: initial,
		signal: new AbortController().signal,
		callbacks,
	});
	const body = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
	expect(body.contents[1].parts[0].thoughtSignature).toBe("sig");
	expect(body.contents[2].parts[0].functionResponse.id).toBe("id-1");
});
test("the step limit requests an honest final response with tools disabled", async () => {
	fetchSpy.mockImplementation(
		Object.assign(
			async (_url: unknown, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body));
				return Response.json({
					content: {
						role: "model",
						parts: body.allowTools
							? [{ functionCall: { name: "get_editing_catalog", args: {} } }]
							: [{ text: "Etapas concluídas nesta rodada." }],
					},
				});
			},
			{ preconnect: () => {} },
		),
	);
	const texts: string[] = [];
	await runAgent({
		editor,
		contents: initial,
		signal: new AbortController().signal,
		callbacks: { ...callbacks, onText: (text) => texts.push(text) },
	});
	expect(fetchSpy).toHaveBeenCalledTimes(21);
	expect(texts).toContain("Etapas concluídas nesta rodada.");
});
test("a changed scene while the model is responding prevents tool execution", async () => {
	let scene = "original";
	const current = {
		project: editor.project,
		scenes: { getActiveScene: () => ({ id: scene }) },
	} as unknown as EditorCore;
	fetchSpy.mockImplementation(
		Object.assign(
			async () => {
				scene = "new-scene";
				return Response.json({
					content: {
						role: "model",
						parts: [
							{
								functionCall: {
									name: "set_project_format",
									args: { width: 1080, height: 1920 },
								},
							},
						],
					},
				});
			},
			{ preconnect: () => {} },
		),
	);
	await expect(
		runAgent({
			editor: current,
			contents: initial,
			signal: new AbortController().signal,
			callbacks,
		}),
	).rejects.toThrow("cena mudou");
});
test("cancelled tasks never call the model", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(
		runAgent({
			editor,
			contents: initial,
			signal: controller.signal,
			callbacks,
		}),
	).rejects.toMatchObject({ name: "AbortError" });
	expect(fetchSpy).not.toHaveBeenCalled();
});
test("prototype properties cannot be used as tool names", async () => {
	const outcome = await executeTool({
		ctx: { editor },
		name: "constructor",
		args: {},
	});
	expect(outcome.ok).toBe(false);
	expect(outcome.result.error).toContain("Unknown tool");
});
