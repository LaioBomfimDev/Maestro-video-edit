const STORAGE_KEY = "maestro.gemini.api-key";
export const GEMINI_KEY_HEADER = "x-gemini-api-key";

let sessionKey = "";

function browserStorage(): Storage | undefined {
	try {
		return typeof window === "undefined" ? undefined : window.sessionStorage;
	} catch {
		return undefined;
	}
}

export function getGeminiApiKey(storage = browserStorage()): string {
	try {
		return storage ? (storage.getItem(STORAGE_KEY) ?? "") : sessionKey;
	} catch {
		return sessionKey;
	}
}

export function setGeminiApiKey(value: string, storage = browserStorage()) {
	sessionKey = value.trim();
	try {
		if (sessionKey) storage?.setItem(STORAGE_KEY, sessionKey);
		else storage?.removeItem(STORAGE_KEY);
	} catch {
		// A private browser may disable storage; the key still works in this tab.
	}
}

export function geminiRequestHeaders(apiKey = getGeminiApiKey()) {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (apiKey) headers[GEMINI_KEY_HEADER] = apiKey;
	return headers;
}
