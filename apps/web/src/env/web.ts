import { z } from "zod";

export const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
	NEXT_PUBLIC_MARBLE_API_URL: z.url().default("https://api.marblecms.com"),

	// Server
	DATABASE_URL: z
		.string()
		.refine(
			(url) => url.startsWith("postgres://") || url.startsWith("postgresql://"),
			"DATABASE_URL must be a postgres:// or postgresql:// URL",
		)
		.optional(),

	BETTER_AUTH_SECRET: z.string().optional(),
	UPSTASH_REDIS_REST_URL: z.url().optional(),
	UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
	MARBLE_WORKSPACE_KEY: z.string().optional(),
	FREESOUND_CLIENT_ID: z.string().optional(),
	FREESOUND_API_KEY: z.string().optional(),
	GEMINI_API_KEY: z.string().optional(),
	GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
	GEMINI_FALLBACK_MODELS: z
		.string()
		.default("gemini-3.5-flash-lite,gemini-3.1-flash-lite"),
	GEMINI_THINKING_LEVEL: z
		.enum(["minimal", "low", "medium", "high", "off"])
		.default("low"),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

// Empty values from a deployment's settings mean the integration is not set up.
// Supplied values still go through the normal URL and type validation.
export const webEnv = webEnvSchema.parse(
	Object.fromEntries(
		Object.entries(process.env).map(([key, value]) => [
			key,
			value?.trim() ? value : undefined,
		]),
	),
);
