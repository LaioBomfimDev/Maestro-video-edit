import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { captureAttempt, usageHeaders } from "../server/usage";
import { recordUsageResponse, usageScope, useUsageStore } from "../usage-store";
import { USAGE_HEADER } from "../usage-types";
import { POST as chat } from "@/app/api/ai/chat/route";
import { NextRequest } from "next/server";
import { webEnv } from "@/env/web";
import { GEMINI_KEY_HEADER } from "../credentials";
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const previousModel = webEnv.GEMINI_MODEL,
	previousFallback = webEnv.GEMINI_FALLBACK_MODELS;
beforeEach(() => {
	useUsageStore.setState({
		profiles: {},
		hydrated: true,
		persistenceFailed: false,
	});
	webEnv.GEMINI_MODEL = "model-main";
	webEnv.GEMINI_FALLBACK_MODELS = "model-fallback";
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async () => {
				throw new Error("Unexpected provider request");
			},
			{ preconnect: () => {} },
		),
	);
});
afterEach(() => {
	fetchSpy.mockRestore();
	webEnv.GEMINI_MODEL = previousModel;
	webEnv.GEMINI_FALLBACK_MODELS = previousFallback;
	useUsageStore.setState({
		profiles: {},
		hydrated: false,
		persistenceFailed: false,
	});
});
test("usage telemetry contains numeric totals without double-counting thinking or exposing content", () => {
	const attempt = captureAttempt({
		model: "gemini-test",
		at: Date.now(),
		response: new Response(null, { status: 200 }),
		body: {
			usageMetadata: {
				promptTokenCount: 100,
				candidatesTokenCount: 20,
				thoughtsTokenCount: 10,
				totalTokenCount: 130,
			},
			secret: "DO_NOT_COPY",
			candidates: [{ content: { parts: [{ text: "PRIVATE_PROMPT" }] } }],
		},
	});
	expect(attempt).toMatchObject({
		inputTokens: 100,
		outputTokens: 20,
		totalTokens: 130,
		status: 200,
	});
	const header = usageHeaders([attempt])[USAGE_HEADER];
	expect(header).not.toContain("DO_NOT_COPY");
	expect(header).not.toContain("PRIVATE_PROMPT");
});
test("missing metadata stays unknown and retry suggestions are preserved", () => {
	const attempt = captureAttempt({
		model: "gemini-test",
		at: Date.now(),
		response: new Response(null, { status: 429 }),
		body: {
			error: {
				details: [
					{
						"@type": "type.googleapis.com/google.rpc.RetryInfo",
						retryDelay: "31.5s",
					},
				],
			},
		},
	});
	expect(attempt.inputTokens).toBeUndefined();
	expect(attempt.totalTokens).toBeUndefined();
	expect(attempt.retryAfterSeconds).toBe(31.5);
});
test("fallbacks report every actual attempt with its own model and status", async () => {
	fetchSpy.mockResolvedValueOnce(
		Response.json(
			{ error: { message: "quota" } },
			{ status: 429, headers: { "retry-after": "5" } },
		),
	);
	fetchSpy.mockResolvedValueOnce(
		Response.json({
			candidates: [{ content: { role: "model", parts: [{ text: "Olá" }] } }],
			usageMetadata: {
				promptTokenCount: 20,
				candidatesTokenCount: 10,
				totalTokenCount: 35,
			},
		}),
	);
	const response = await chat(
		new NextRequest("https://maestro.example/api/ai/chat", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[GEMINI_KEY_HEADER]: "fake-personal-key",
			},
			body: JSON.stringify({
				contents: [{ role: "user", parts: [{ text: "Private test prompt" }] }],
			}),
		}),
	);
	expect(response.status).toBe(200);
	const header = response.headers.get(USAGE_HEADER)!;
	const telemetry = JSON.parse(header);
	expect(telemetry.attempts).toHaveLength(2);
	expect(telemetry.attempts[0]).toMatchObject({
		model: "model-main",
		status: 429,
		retryAfterSeconds: 5,
	});
	expect(telemetry.attempts[1]).toMatchObject({
		model: "model-fallback",
		inputTokens: 20,
		totalTokens: 35,
	});
	expect(header).not.toContain("fake-personal-key");
	expect(header).not.toContain("Private test prompt");
	expect(response.headers.get("cache-control")).toBe("no-store");
});
test("key switching isolates counters, deduplicates responses and never stores the raw key", async () => {
	const a = await usageScope("FAKE_KEY_A"),
		b = await usageScope("FAKE_KEY_B");
	expect(a).not.toBe(b);
	const attempt = captureAttempt({
		model: "gemini-test",
		at: Date.now(),
		response: new Response(null, { status: 200 }),
		body: { usageMetadata: { totalTokenCount: 50 } },
	});
	const response = new Response(null, { headers: usageHeaders([attempt]) });
	await recordUsageResponse({ response, apiKey: "FAKE_KEY_A" });
	await recordUsageResponse({ response, apiKey: "FAKE_KEY_A" });
	useUsageStore
		.getState()
		.setLimits({
			scope: a,
			model: "gemini-test",
			limits: { rpm: 10, tpm: 1000, rpd: 100 },
		});
	expect(useUsageStore.getState().profiles[a].attempts).toHaveLength(1);
	expect(useUsageStore.getState().profiles[b]).toBeUndefined();
	expect(JSON.stringify(useUsageStore.getState().profiles)).not.toContain(
		"FAKE_KEY_A",
	);
	expect(JSON.stringify(useUsageStore.getState().profiles)).not.toContain(
		"FAKE_KEY_B",
	);
});
test("metadata unavailable or malformed never prevents the original response", async () => {
	await recordUsageResponse({
		response: new Response(null, { headers: { [USAGE_HEADER]: "not json" } }),
		apiKey: "fake",
	});
	expect(Object.keys(useUsageStore.getState().profiles)).toHaveLength(0);
});
