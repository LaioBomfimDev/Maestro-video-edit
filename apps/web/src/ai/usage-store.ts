import { create } from "zustand";
import {
	attemptSchema,
	telemetrySchema,
	USAGE_HEADER,
	type UsageAttempt,
} from "./usage-types";
import { z } from "zod";
const STORAGE = "maestro.gemini.usage.v1";
const limitsSchema = z.object({
	rpm: z.number().int().min(0).max(1e12),
	tpm: z.number().int().min(0).max(1e12),
	rpd: z.number().int().min(0).max(1e12),
});
export type UsageLimits = z.infer<typeof limitsSchema>;
const profileSchema = z.object({
	attempts: z.array(attemptSchema).max(5000),
	limits: z.record(z.string(), limitsSchema),
	truncated: z.boolean().default(false),
});
const profilesSchema = z.record(z.string(), profileSchema);
export type UsageProfile = z.infer<typeof profileSchema>;
interface State {
	profiles: Record<string, UsageProfile>;
	hydrated: boolean;
	persistenceFailed: boolean;
	hydrate: () => void;
	record: (params: { scope: string; attempts: UsageAttempt[] }) => void;
	setLimits: (params: {
		scope: string;
		model: string;
		limits: UsageLimits;
	}) => void;
}
export const EMPTY_PROFILE: UsageProfile = {
	attempts: [],
	limits: {},
	truncated: false,
};
function persist(profiles: State["profiles"]): boolean {
	try {
		if (typeof window !== "undefined")
			window.sessionStorage.setItem(STORAGE, JSON.stringify(profiles));
		return true;
	} catch {
		return false;
	}
}
export const useUsageStore = create<State>((set, get) => ({
	profiles: {},
	hydrated: false,
	persistenceFailed: false,
	hydrate: () => {
		if (get().hydrated) return;
		let profiles: State["profiles"] = {};
		try {
			const raw =
				typeof window !== "undefined"
					? window.sessionStorage.getItem(STORAGE)
					: null;
			if (raw) {
				const parsed = profilesSchema.safeParse(JSON.parse(raw));
				if (parsed.success) profiles = parsed.data;
			}
		} catch {
			/* Storage may be unavailable. */
		}
		set({ profiles, hydrated: true });
	},
	record: ({ scope, attempts }) => {
		get().hydrate();
		const safe = telemetrySchema.safeParse({ attempts });
		if (!safe.success) return;
		const profiles = { ...get().profiles };
		const previous = profiles[scope] ?? EMPTY_PROFILE;
		const seen = new Set(previous.attempts.map((e) => e.id));
		const additions = safe.data.attempts.filter((e) => !seen.has(e.id));
		const all = [...previous.attempts, ...additions];
		profiles[scope] = {
			...previous,
			attempts: all.slice(-5000),
			truncated: previous.truncated || all.length > 5000,
		};
		const names = Object.keys(profiles).filter((key) => key !== scope);
		while (Object.keys(profiles).length > 5) {
			const oldest = names.shift();
			if (!oldest) break;
			delete profiles[oldest];
		}
		set({ profiles, persistenceFailed: !persist(profiles) });
	},
	setLimits: ({ scope, model, limits }) => {
		get().hydrate();
		const parsed = limitsSchema.safeParse(limits);
		if (!parsed.success) return;
		const profiles = { ...get().profiles };
		const previous = profiles[scope] ?? EMPTY_PROFILE;
		profiles[scope] = {
			...previous,
			limits: { ...previous.limits, [model]: parsed.data },
		};
		set({ profiles, persistenceFailed: !persist(profiles) });
	},
}));

export async function usageScope(apiKey: string): Promise<string> {
	if (!apiKey) return "server";
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(apiKey),
	);
	return (
		"key-" +
		[...new Uint8Array(digest)]
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("")
	);
}

export async function recordUsageResponse({
	response,
	apiKey,
}: {
	response: Response;
	apiKey: string;
}) {
	const raw = response.headers.get(USAGE_HEADER);
	if (!raw) return;
	try {
		const parsed = telemetrySchema.safeParse(JSON.parse(raw));
		if (parsed.success)
			useUsageStore
				.getState()
				.record({
					scope: await usageScope(apiKey),
					attempts: parsed.data.attempts,
				});
	} catch {
		/* Telemetry never prevents an edit. */
	}
}
