import { captureAttempt, usageHeaders } from "@/ai/server/usage";
import type { UsageAttempt } from "@/ai/usage-types";
import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { resolveGeminiApiKey } from "@/ai/server/api-key";

export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "no-store" };
const schema = z.object({
	prompt: z.string().trim().min(3).max(4000),
	model: z
		.enum(["gemini-nano-banana-2.1", "gemini-3.1-flash-lite-image"])
		.default("gemini-nano-banana-2.1"),
	mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
	data: z
		.string()
		.min(4)
		.max(2_800_000)
		.regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
const providerSchema = z.object({
	candidates: z
		.array(
			z.object({
				content: z
					.object({
						parts: z.array(
							z.object({
								inlineData: z
									.object({
										mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
										data: z.string().max(28_000_000),
									})
									.optional(),
							}),
						),
					})
					.optional(),
			}),
		)
		.optional(),
});

export async function POST(request: Request) {
	const attempts: UsageAttempt[] = [];
	const error = ({ message, status }: { message: string; status: number }) =>
		NextResponse.json(
			{ error: message },
			{ status, headers: usageHeaders(attempts) },
		);

	const credentials = resolveGeminiApiKey(request);
	if (!credentials.apiKey)
		return error({
			message: credentials.error ?? "Configure sua chave Gemini.",
			status: credentials.status ?? 503,
		});
	if (Number(request.headers.get("content-length")) > 3_000_000)
		return error({
			message: "Imagem muito grande. Use uma imagem menor.",
			status: 413,
		});
	let input: z.infer<typeof schema>;
	let startedAt: number | undefined;
	try {
		const text = await request.text();
		if (text.length > 3_000_000)
			return error({
				message: "Imagem muito grande. Use uma imagem menor.",
				status: 413,
			});
		const parsed = schema.safeParse(JSON.parse(text));
		if (!parsed.success)
			return error({
				message:
					"Pedido inválido. Envie uma imagem PNG, JPEG ou WebP e uma descrição de 3 a 4000 caracteres.",
				status: 400,
			});
		input = parsed.data;
		const bytes = Buffer.from(input.data, "base64");
		if (bytes.length > 2_100_000)
			return error({ message: "Imagem muito grande.", status: 413 });
		const meta = await sharp(bytes, {
			limitInputPixels: 20_000_000,
		}).metadata();
		const expected = {
			"image/png": "png",
			"image/jpeg": "jpeg",
			"image/webp": "webp",
		}[input.mimeType];
		if (meta.format !== expected || !meta.width || !meta.height)
			return error({ message: "Imagem inválida.", status: 400 });
	} catch {
		return error({
			message: "Não foi possível ler a imagem enviada.",
			status: 400,
		});
	}
	try {
		startedAt = Date.now();
		const upstream = await fetch(
			`https://generativelanguage.googleapis.com/v1/models/${input.model}:generateContent`,
			{
				method: "POST",
				cache: "no-store",
				signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": credentials.apiKey,
				},
				body: JSON.stringify({
					contents: [
						{
							role: "user",
							parts: [
								{ text: input.prompt },
								{ inlineData: { mimeType: input.mimeType, data: input.data } },
							],
						},
					],
					generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
				}),
			},
		);
		const payload: unknown = await upstream.json().catch(() => null);
		attempts.push(
			captureAttempt({
				model: input.model,
				at: startedAt,
				response: upstream,
				body: payload,
			}),
		);
		if (!upstream.ok) {
			if (upstream.status === 429)
				return error({
					message:
						"Limite ou saldo da chave Gemini atingido. Confira sua conta e tente mais tarde.",
					status: 429,
				});
			if ([401, 403].includes(upstream.status))
				return error({
					message:
						"A chave não tem acesso à edição de imagem. Confira a chave, o modelo e o faturamento no Google AI Studio.",
					status: upstream.status,
				});
			if (upstream.status === 404)
				return error({
					message:
						"Este modelo de imagem não está disponível para sua chave. Tente o outro modelo.",
					status: 404,
				});
			return error({
				message: "O Gemini não conseguiu editar a imagem. Tente outro pedido.",
				status: 502,
			});
		}
		const parsed = providerSchema.safeParse(payload);
		const image = parsed.success
			? parsed.data.candidates?.[0]?.content?.parts.find(
					(part) => part.inlineData,
				)?.inlineData
			: undefined;
		if (!image)
			return error({
				message:
					"O Gemini não retornou uma imagem. Reformule o pedido e tente novamente.",
				status: 422,
			});
		const output = await sharp(Buffer.from(image.data, "base64"), {
			limitInputPixels: 40_000_000,
		})
			.rotate()
			.resize({
				width: 2048,
				height: 2048,
				fit: "inside",
				withoutEnlargement: true,
			})
			.webp({ quality: 90 })
			.toBuffer();
		if (output.length > 4_000_000)
			return error({
				message:
					"O resultado ficou muito grande. Tente um pedido mais simples.",
				status: 502,
			});
		return new Response(new Uint8Array(output), {
			headers: {
				...headers,
				...usageHeaders(attempts),
				"Content-Type": "image/webp",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch {
		if (startedAt !== undefined && !attempts.length)
			attempts.push(captureAttempt({ model: input.model, at: startedAt }));
		return error({
			message:
				"Não foi possível concluir a edição. Verifique sua conexão e tente novamente.",
			status: 504,
		});
	}
}
