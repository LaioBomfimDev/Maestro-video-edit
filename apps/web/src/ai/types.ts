import { z } from "zod";

export const geminiPartSchema = z
	.object({
		text: z.string().optional(),
		thought: z.boolean().optional(),
		thoughtSignature: z.string().optional(),
		functionCall: z
			.object({
				name: z.string(),
				id: z.string().optional(),
				args: z.record(z.string(), z.unknown()).optional(),
			})
			.optional(),
		functionResponse: z
			.object({
				name: z.string(),
				id: z.string().optional(),
				response: z.record(z.string(), z.unknown()),
			})
			.optional(),
	})
	.passthrough();

export const geminiContentSchema = z.object({
	role: z.enum(["user", "model"]),
	parts: z.array(geminiPartSchema),
});

export type GeminiPart = z.infer<typeof geminiPartSchema>;
export type GeminiContent = z.infer<typeof geminiContentSchema>;

export const chatRequestSchema = z.object({
	contents: z.array(geminiContentSchema).min(1).max(400),
	styleReference: z.string().max(20_000).optional(),
	visualAnalysisEnabled: z.boolean().default(false),
	allowTools: z.boolean().default(true),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
	content: geminiContentSchema,
});

export type ToolResult = Record<string, unknown>;

export interface AiActionLog {
	name: string;
	summary: string;
	ok: boolean;
}
