import { z } from "zod";
import {
	USAGE_HEADER,
	usageMetadataSchema,
	type UsageAttempt,
} from "../usage-types";
const payloadSchema = z.object({
	usageMetadata: usageMetadataSchema.optional(),
	error: z
		.object({
			details: z
				.array(
					z.object({
						"@type": z.string().optional(),
						retryDelay: z.string().max(32).optional(),
					}),
				)
				.optional(),
		})
		.optional(),
});

export function captureAttempt({
	model,
	at,
	response,
	body,
}: {
	model: string;
	at: number;
	response?: Response;
	body?: unknown;
}): UsageAttempt {
	const parsed = payloadSchema.safeParse(body);
	const usage = parsed.success ? parsed.data.usageMetadata : undefined;
	const retry = parsed.success
		? parsed.data.error?.details?.find((d) =>
				d["@type"]?.endsWith("google.rpc.RetryInfo"),
			)?.retryDelay
		: undefined;
	const header = response?.headers.get("retry-after");
	const seconds = header
		? /^\d+(\.\d+)?$/.test(header)
			? Number(header)
			: (Date.parse(header) - Date.now()) / 1000
		: retry && /^\d+(\.\d+)?s$/.test(retry)
			? Number(retry.slice(0, -1))
			: undefined;
	return {
		id: crypto.randomUUID(),
		model: /^[a-zA-Z0-9._-]{1,128}$/.test(model) ? model : "unknown",
		at,
		receivedAt: Date.now(),
		status: response?.status ?? 0,
		...(usage?.promptTokenCount !== undefined
			? { inputTokens: usage.promptTokenCount }
			: {}),
		...(usage?.candidatesTokenCount !== undefined
			? { outputTokens: usage.candidatesTokenCount }
			: {}),
		...(usage?.totalTokenCount !== undefined
			? { totalTokens: usage.totalTokenCount }
			: {}),
		...(seconds !== undefined && Number.isFinite(seconds)
			? { retryAfterSeconds: Math.max(0, Math.min(86400, seconds)) }
			: {}),
	};
}

export function usageHeaders(attempts: UsageAttempt[]) {
	return {
		"Cache-Control": "no-store",
		[USAGE_HEADER]: JSON.stringify({ attempts }),
	};
}
