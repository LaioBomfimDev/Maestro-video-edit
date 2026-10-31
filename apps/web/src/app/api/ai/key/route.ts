import { NextResponse, type NextRequest } from "next/server";
import { resolveGeminiApiKey } from "@/ai/server/api-key";

export const maxDuration = 30;

const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
	const credentials = resolveGeminiApiKey(request);
	if ("error" in credentials) {
		return NextResponse.json(
			{ error: credentials.error },
			{ status: credentials.status, headers },
		);
	}
	try {
		// Listing a model verifies access without generating text or running edits.
		const upstream = await fetch(
			"https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
			{
				headers: { "x-goog-api-key": credentials.apiKey },
				cache: "no-store",
				signal: AbortSignal.timeout(15_000),
			},
		);
		if (!upstream.ok) {
			const error =
				upstream.status === 429
					? "O Gemini limitou as requisições desta chave. Tente novamente mais tarde."
					: "Não foi possível validar a chave. Confira se ela está ativa e tem acesso à API Gemini.";
			return NextResponse.json(
				{ error },
				{
					status: [401, 403, 429].includes(upstream.status)
						? upstream.status
						: 502,
					headers,
				},
			);
		}
		return NextResponse.json(
			{ ok: true, message: "Conexão com Gemini verificada." },
			{ headers },
		);
	} catch {
		return NextResponse.json(
			{ error: "Não foi possível conectar ao Gemini. Tente novamente." },
			{ status: 504, headers },
		);
	}
}
