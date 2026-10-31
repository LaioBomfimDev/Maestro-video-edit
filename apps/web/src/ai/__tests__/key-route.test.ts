import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { NextRequest } from "next/server";
import { POST as testKey } from "../../app/api/ai/key/route";
import { POST as chat } from "../../app/api/ai/chat/route";
import { GEMINI_KEY_HEADER } from "../credentials";
import { webEnv } from "@/env/web";

const originalServerKey = webEnv.GEMINI_API_KEY;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

beforeEach(() => {
	webEnv.GEMINI_API_KEY = undefined;
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async () => {
				throw new Error("Unexpected upstream request");
			},
			{ preconnect: () => {} },
		),
	);
});
afterEach(() => {
	fetchSpy.mockRestore();
	webEnv.GEMINI_API_KEY = originalServerKey;
});

function request(path: string, apiKey?: string, body?: unknown) {
	return new NextRequest(`https://maestro.example${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(apiKey ? { [GEMINI_KEY_HEADER]: apiKey } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
}

describe("Gemini key API", () => {
	test("requires a personal key and makes no upstream request when missing", async () => {
		const response = await testKey(request("/api/ai/key"));
		expect(response.status).toBe(503);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test("validates access without generating content or returning the key", async () => {
		fetchSpy.mockResolvedValueOnce(
			Response.json({ models: [{ name: "models/test" }] }),
		);
		const response = await testKey(request("/api/ai/key", "personal-test-key"));
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(fetchSpy.mock.calls[0][0]).toBe(
			"https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
		);
		expect(
			new Headers(fetchSpy.mock.calls[0][1]?.headers).get("x-goog-api-key"),
		).toBe("personal-test-key");
		expect(await response.text()).not.toContain("personal-test-key");
	});

	test("does not expose a key echoed in provider errors", async () => {
		fetchSpy.mockResolvedValueOnce(
			Response.json(
				{ error: { message: "Bad personal-test-key" } },
				{ status: 403 },
			),
		);
		const response = await testKey(request("/api/ai/key", "personal-test-key"));
		expect(response.status).toBe(403);
		expect(await response.text()).not.toContain("personal-test-key");
	});

	test("chat works with a personal key and no server environment key", async () => {
		fetchSpy.mockResolvedValueOnce(
			Response.json({
				candidates: [
					{ content: { role: "model", parts: [{ text: "Pronto" }] } },
				],
			}),
		);
		const response = await chat(
			request("/api/ai/chat", "personal-test-key", {
				contents: [{ role: "user", parts: [{ text: "Olá" }] }],
			}),
		);
		expect(response.status).toBe(200);
		expect(
			new Headers(fetchSpy.mock.calls[0][1]?.headers).get("x-goog-api-key"),
		).toBe("personal-test-key");
		expect(String(fetchSpy.mock.calls[0][1]?.body)).not.toContain(
			"personal-test-key",
		);
	});
});
