import { captureAttempt, usageHeaders } from "@/ai/server/usage";
import type { UsageAttempt } from "@/ai/usage-types";
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
	const attempts: UsageAttempt[] = [];
	const reply = ({ body, status = 200 }: { body: unknown; status?: number }) =>
		NextResponse.json(body, { status, headers: usageHeaders(attempts) });
	const credentials = resolveGeminiApiKey(request, webEnv.GEMINI_API_KEY);
	if ("error" in credentials) {
		return reply({
			body: { error: credentials.error },
			status: credentials.status,
		});
	}
	const { apiKey } = credentials;

	const body = await request.json().catch(() => null);
	const parsed = chatRequestSchema.safeParse(body);
	if (!parsed.success) {
		return reply({
			body: {
				error: "Invalid input",
				details: parsed.error.flatten().fieldErrors,
			},
			status: 400,
		});
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
	let upstreamJson: unknown = null;
	let networkError: unknown = null;
	for (const model of models) {
		const at = Date.now();
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
			attempts.push(captureAttempt({ model, at }));
			networkError = attempt;
			continue;
		}
		upstreamJson = await attempt.json().catch(() => null);
		attempts.push(
			captureAttempt({ model, at, response: attempt, body: upstreamJson }),
		);
		upstream = attempt;
		if (!RETRYABLE_STATUSES.has(attempt.status)) break;
	}

	if (!upstream) {
		const timedOut =
			networkError instanceof DOMException &&
			networkError.name === "TimeoutError";
		return reply({
			body: { error: timedOut ? "Gemini timed out" : "Could not reach Gemini" },
			status: 504,
		});
	}

	const json = upstreamJson;
	const data = geminiResponseSchema.safeParse(json);

	if (upstream.status === 401 || upstream.status === 403) {
		return reply({
			body: {
				error:
					"O Gemini recusou esta chave. Confira ou troque a chave no botão Gemini.",
			},
			status: upstream.status,
		});
	}

	if (upstream.status === 429) {
		return reply({
			body: {
				error:
					"O Gemini atingiu um limite de uso (429). Consulte Gemini · Cota e o AI Studio, aguarde ou revise os limites do projeto.",
			},
			status: 429,
		});
	}

	if (!upstream.ok || !data.success) {
		const message = data.success
			? (data.data.error?.message ?? upstream.statusText)
			: "Unexpected response from Gemini";
		return reply({
			body: { error: redactApiKey(message, apiKey) },
			status: 502,
		});
	}

	const candidate = data.data.candidates?.[0];
	if (!candidate?.content) {
		const reason =
			data.data.promptFeedback?.blockReason ??
			candidate?.finishReason ??
			"empty response";
		return reply({
			body: { error: `Gemini returned no content (${reason})` },
			status: 502,
		});
	}

	return reply({
		body: {
			content: { role: "model", parts: candidate.content.parts ?? [] },
		},
	});
}
