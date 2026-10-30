import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { webEnv } from "@/env/web";
import { AI_TOOL_DECLARATIONS } from "@/ai/declarations";
import { buildSystemPrompt } from "@/ai/system-prompt";
import { chatRequestSchema, geminiContentSchema } from "@/ai/types";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TIMEOUT_MS = 90_000;

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
	const apiKey = webEnv.GEMINI_API_KEY;
	if (!apiKey) {
		return NextResponse.json(
			{ error: "GEMINI_API_KEY is not configured on the server." },
			{ status: 503 },
		);
	}

	const body = await request.json().catch(() => null);
	const parsed = chatRequestSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	const { contents, styleReference } = parsed.data;
	const upstream = await fetch(
		`${GEMINI_API_URL}/models/${encodeURIComponent(webEnv.GEMINI_MODEL)}:generateContent`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": apiKey,
			},
			body: JSON.stringify({
				systemInstruction: {
					parts: [{ text: buildSystemPrompt({ styleReference }) }],
				},
				contents,
				tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS }],
				toolConfig: { functionCallingConfig: { mode: "AUTO" } },
			}),
			signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
		},
	).catch((error: unknown) => error);

	if (!(upstream instanceof Response)) {
		const timedOut =
			upstream instanceof DOMException && upstream.name === "TimeoutError";
		return NextResponse.json(
			{ error: timedOut ? "Gemini timed out" : "Could not reach Gemini" },
			{ status: 504 },
		);
	}

	const json = await upstream.json().catch(() => null);
	const data = geminiResponseSchema.safeParse(json);

	if (!upstream.ok || !data.success) {
		const message = data.success
			? (data.data.error?.message ?? upstream.statusText)
			: "Unexpected response from Gemini";
		return NextResponse.json({ error: message }, { status: 502 });
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
