import { betterAuth, type RateLimit } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Redis } from "@upstash/redis";
import { getDb } from "@/db";
import { webEnv } from "@/env/web";

function createConfiguredAuth() {
	const {
		DATABASE_URL,
		BETTER_AUTH_SECRET,
		UPSTASH_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN,
	} = webEnv;
	if (
		!DATABASE_URL ||
		!BETTER_AUTH_SECRET ||
		!UPSTASH_REDIS_REST_URL ||
		!UPSTASH_REDIS_REST_TOKEN
	) {
		return null;
	}
	const redis = new Redis({
		url: UPSTASH_REDIS_REST_URL,
		token: UPSTASH_REDIS_REST_TOKEN,
	});
	return betterAuth({
		database: drizzleAdapter(getDb(), {
			provider: "pg",
			usePlural: true,
		}),
		secret: BETTER_AUTH_SECRET,
		user: {
			deleteUser: {
				enabled: true,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		rateLimit: {
			storage: "secondary-storage",
			customStorage: {
				get: async (key) => {
					const value = await redis.get(key);
					return value as RateLimit | undefined;
				},
				set: async (key, value) => {
					await redis.set(key, value);
				},
			},
		},
		baseURL: webEnv.NEXT_PUBLIC_SITE_URL,
		appName: "Maestro",
		trustedOrigins: [webEnv.NEXT_PUBLIC_SITE_URL],
	});
}

export const auth = createConfiguredAuth();

export type Auth = NonNullable<typeof auth>;
