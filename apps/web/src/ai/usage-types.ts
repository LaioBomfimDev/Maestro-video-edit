import { z } from "zod";
export const USAGE_HEADER = "x-maestro-ai-usage";
const count = z.number().int().min(0).max(1e12);
export const attemptSchema = z.object({
	id: z.string().min(1).max(80),
	model: z.string().regex(/^[a-zA-Z0-9._-]{1,128}$/),
	at: z.number().min(0).max(9e12),
	receivedAt: z.number().min(0).max(9e12),
	status: z.number().int().min(0).max(599),
	inputTokens: count.optional(),
	outputTokens: count.optional(),
	totalTokens: count.optional(),
	retryAfterSeconds: z.number().min(0).max(86400).optional(),
});
export const telemetrySchema = z.object({
	attempts: z.array(attemptSchema).max(16),
});
export type UsageAttempt = z.infer<typeof attemptSchema>;
export const usageMetadataSchema = z.object({
	promptTokenCount: count.optional(),
	candidatesTokenCount: count.optional(),
	totalTokenCount: count.optional(),
});
