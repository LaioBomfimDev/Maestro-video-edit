import { z } from "zod";
import { GEMINI_KEY_HEADER } from "../credentials";

export const geminiApiKeySchema = z
	.string()
	.trim()
	.min(1, "Informe sua chave do Gemini.")
	.max(4096, "A chave informada é muito longa.")
	.regex(
		/^[\x21-\x7E]+$/,
		"A chave não pode conter espaços ou quebras de linha.",
	);

export function resolveGeminiApiKey(request: Request, serverKey?: string) {
	const supplied = request.headers.get(GEMINI_KEY_HEADER);
	if (supplied !== null) {
		const parsed = geminiApiKeySchema.safeParse(supplied);
		if (!parsed.success) {
			return {
				error: "A chave Gemini informada é inválida.",
				status: 400,
			} as const;
		}
		return { apiKey: parsed.data } as const;
	}
	if (serverKey) return { apiKey: serverKey } as const;
	return {
		error: "Configure sua chave no botão Gemini do Assistente IA.",
		status: 503,
	} as const;
}

export function redactApiKey(message: string, apiKey: string) {
	return message.split(apiKey).join("[chave ocultada]");
}
