import { describe, expect, test } from "bun:test";
import {
	getGeminiApiKey,
	setGeminiApiKey,
	geminiRequestHeaders,
	GEMINI_KEY_HEADER,
} from "../credentials";
import { resolveGeminiApiKey, redactApiKey } from "../server/api-key";

function memoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => {
			values.set(key, value);
		},
		removeItem: (key) => {
			values.delete(key);
		},
		key: (index) => [...values.keys()][index] ?? null,
	};
}

describe("Gemini credentials", () => {
	test("changes and removes the key without sharing it with another tab", () => {
		const tab = memoryStorage();
		const otherTab = memoryStorage();
		setGeminiApiKey(" first-test-key ", tab);
		expect(getGeminiApiKey(tab)).toBe("first-test-key");
		expect(getGeminiApiKey(otherTab)).toBe("");
		setGeminiApiKey("replacement-test-key", tab);
		expect(getGeminiApiKey(tab)).toBe("replacement-test-key");
		setGeminiApiKey("", tab);
		expect(getGeminiApiKey(tab)).toBe("");
		expect(tab.length).toBe(0);
	});

	test("keeps the key out of URLs and uses a separate request header", () => {
		expect(geminiRequestHeaders("test-key")).toEqual({
			"Content-Type": "application/json",
			[GEMINI_KEY_HEADER]: "test-key",
		});
		expect(geminiRequestHeaders("")).not.toHaveProperty(GEMINI_KEY_HEADER);
	});

	test("prefers the personal key to the server key", () => {
		const request = new Request("https://maestro.example/api/ai/chat", {
			headers: { [GEMINI_KEY_HEADER]: "personal-test-key" },
		});
		expect(resolveGeminiApiKey(request, "server-test-key")).toEqual({
			apiKey: "personal-test-key",
		});
	});

	test("uses the server key only when the personal header is absent", () => {
		const request = new Request("https://maestro.example/api/ai/chat");
		expect(resolveGeminiApiKey(request, "server-test-key")).toEqual({
			apiKey: "server-test-key",
		});
		expect(resolveGeminiApiKey(request)).toMatchObject({ status: 503 });
	});

	test("rejects an invalid personal key instead of falling back to the server", () => {
		const request = new Request("https://maestro.example/api/ai/chat", {
			headers: { [GEMINI_KEY_HEADER]: "invalid key" },
		});
		expect(resolveGeminiApiKey(request, "server-test-key")).toMatchObject({
			status: 400,
		});
	});

	test("removes credentials from provider error messages", () => {
		expect(
			redactApiKey(
				"Invalid secret-test-key: secret-test-key",
				"secret-test-key",
			),
		).toBe("Invalid [chave ocultada]: [chave ocultada]");
	});
});
