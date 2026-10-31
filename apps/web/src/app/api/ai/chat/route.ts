import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { webEnv } from "@/env/web";
import { AI_TOOL_DECLARATIONS } from "@/ai/declarations";
import { buildSystemPrompt } from "@/ai/system-prompt";
import { chatRequestSchema, geminiContentSchema } from "@/ai/types";
import { resolveGeminiApiKey, redactApiKey } from "@/ai/server/api-key";

// Allow the primary model and two 90-second fallback attempts on Vercel.
export const maxDuration = 300;

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TIMEOUT_MS = 90_000;
// Rate limit / overload / model unavailable: try the next model in the chain.
const RETRYABLE_STATUSES = new Set([404, 429, 500, 503]);

const geminiResponseSchema = z.object({
	candidates: z
		.array(
			z.object({
				content: geminiContentSchema.optional(),
				finishReason: z.string().optional(),
			}),
		)
		.optional(),
	promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
	error: z.object({ message: z.string() }).optional(),
});

export async function POST(request: NextRequest) {
	const credentials = resolveGeminiApiKey(request, webEnv.GEMINI_API_KEY);
	if ("error" in credentials) {
		return NextResponse.json(
			{ error: credentials.error },
			{ status: credentials.status },
		);
	}
	const { apiKey } = credentials;

	const body = await request.json().catch(() => null);
	const parsed = chatRequestSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	const { contents, styleReference } = parsed.data;
	const requestBody = JSON.stringify({
		systemInstruction: {
			parts: [{ text: buildSystemPrompt({ styleReference }) }],
		},
		contents,
		tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS }],
		toolConfig: { functionCallingConfig: { mode: "AUTO" } },
		...(webEnv.GEMINI_THINKING_LEVEL === "off"
			? {}
			: {
					generationConfig: {
						thinkingConfig: { thinkingLevel: webEnv.GEMINI_THINKING_LEVEL },
					},
				}),
	});

	const models = [
		webEnv.GEMINI_MODEL,
		...webEnv.GEMINI_FALLBACK_MODELS.split(",").map((model) => model.trim()),
	].filter((model, index, list) => model && list.indexOf(model) === index);

	let upstream: Response | null = null;
	let networkError: unknown = null;
	for (const model of models) {
		const attempt = await fetch(
			`${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey,
				},
				body: requestBody,
				signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
			},
		).catch((error: unknown) => error);
		if (!(attempt instanceof Response)) {
			networkError = attempt;
			continue;
		}
		upstream = attempt;
		if (!RETRYABLE_STATUSES.has(attempt.status)) break;
	}

	if (!upstream) {
		const timedOut =
			networkError instanceof DOMException &&
			networkError.name === "TimeoutError";
		return NextResponse.json(
			{ error: timedOut ? "Gemini timed out" : "Could not reach Gemini" },
			{ status: 504 },
		);
	}

	const json = await upstream.json().catch(() => null);
	const data = geminiResponseSchema.safeParse(json);

	if (upstream.status === 401 || upstream.status === 403) {
		return NextResponse.json(
			{
				error:
					"O Gemini recusou esta chave. Confira ou troque a chave no botão Gemini.",
			},
			{ status: upstream.status },
		);
	}

	if (upstream.status === 429) {
		return NextResponse.json(
			{
				error:
					"Cota do Gemini esgotada (limite de requisições da sua chave). Tente novamente mais tarde ou use uma chave com mais cota.",
			},
			{ status: 429 },
		);
	}

	if (!upstream.ok || !data.success) {
		const message = data.success
			? (data.data.error?.message ?? upstream.statusText)
			: "Unexpected response from Gemini";
		return NextResponse.json(
			{ error: redactApiKey(message, apiKey) },
			{ status: 502 },
		);
	}

	const candidate = data.data.candidates?.[0];
	if (!candidate?.content) {
		const reason =
			data.data.promptFeedback?.blockReason ??
			candidate?.finishReason ??
			"empty response";
		return NextResponse.json(
			{ error: `Gemini returned no content (${reason})` },
			{ status: 502 },
		);
	}

	return NextResponse.json({
		content: { role: "model", parts: candidate.content.parts ?? [] },
	});
}
