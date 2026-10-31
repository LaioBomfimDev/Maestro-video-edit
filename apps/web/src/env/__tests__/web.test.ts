import { describe, expect, test } from "bun:test";
import { webEnvSchema } from "../web";

describe("web environment", () => {
	test("allows the local editor without optional service credentials", () => {
		const env = webEnvSchema.parse({ NODE_ENV: "production" });
		expect(env.DATABASE_URL).toBeUndefined();
		expect(env.BETTER_AUTH_SECRET).toBeUndefined();
		expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
		expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
		expect(env.MARBLE_WORKSPACE_KEY).toBeUndefined();
		expect(env.FREESOUND_API_KEY).toBeUndefined();
		expect(env.GEMINI_API_KEY).toBeUndefined();
		expect(env.NEXT_PUBLIC_MARBLE_API_URL).toBe("https://api.marblecms.com");
	});

	test("rejects malformed URLs when a service is configured", () => {
		for (const configuration of [
			{ DATABASE_URL: "not-postgres" },
			{ UPSTASH_REDIS_REST_URL: "not-a-url" },
			{ NEXT_PUBLIC_MARBLE_API_URL: "not-a-url" },
		]) {
			expect(
				webEnvSchema.safeParse({ NODE_ENV: "production", ...configuration })
					.success,
			).toBe(false);
		}
	});

	test("preserves explicitly configured service values", () => {
		const configured = {
			NODE_ENV: "production",
			DATABASE_URL: "postgresql://user:password@localhost:5432/test",
			BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
			UPSTASH_REDIS_REST_URL: "https://redis.example.com",
			UPSTASH_REDIS_REST_TOKEN: "test-token",
			GEMINI_API_KEY: "test-key",
		};
		expect(webEnvSchema.parse(configured)).toMatchObject(configured);
	});
});
