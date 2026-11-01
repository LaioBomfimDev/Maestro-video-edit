import { afterEach, beforeEach, test, expect, spyOn } from "bun:test";
import sharp from "sharp";
import { POST } from "@/app/api/ai/vision/route";
import { GEMINI_KEY_HEADER } from "../credentials";
import { USAGE_HEADER } from "../usage-types";
import { webEnv } from "@/env/web";
const originalServerKey = webEnv.GEMINI_API_KEY;
const jpeg = await sharp({
	create: { width: 8, height: 8, channels: 3, background: "red" },
})
	.jpeg()
	.toBuffer();
let upstream: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
beforeEach(() => {
	webEnv.GEMINI_API_KEY = undefined;
	upstream = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async () => {
				throw new Error("Unexpected upstream");
			},
			{ preconnect: () => {} },
		),
	);
});
afterEach(() => {
	upstream.mockRestore();
	webEnv.GEMINI_API_KEY = originalServerKey;
});
function request({
	body = {
		question: "Avalie cores e composição",
		frame: { time: 1.5, mimeType: "image/jpeg", data: jpeg.toString("base64") },
	},
	key = "test-personal-key",
	signal,
}: { body?: unknown; key?: string; signal?: AbortSignal } = {}) {
	return new Request("https://maestro.example/api/ai/vision", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(key ? { [GEMINI_KEY_HEADER]: key } : {}),
		},
		body: JSON.stringify(body),
		signal,
	});
}
test("vision does not contact the provider without a configured key", async () => {
	const response = await POST(request({ key: "" }));
	expect(response.status).toBe(503);
	expect(upstream).not.toHaveBeenCalled();
});
test("malformed frame data is rejected before spending quota", async () => {
	const response = await POST(
		request({
			body: {
				question: "Avalie o quadro",
				frame: { time: 0, mimeType: "image/jpeg", data: "YWJjZA==" },
			},
		}),
	);
	expect(response.status).toBe(400);
	expect(upstream).not.toHaveBeenCalled();
});
test("vision sends the validated frame and accounts for token usage", async () => {
	upstream.mockResolvedValueOnce(
		Response.json({
			usageMetadata: { promptTokenCount: 90, totalTokenCount: 130 },
			candidates: [
				{
					content: {
						parts: [{ text: "O título está legível e centralizado." }],
					},
				},
			],
		}),
	);
	const response = await POST(request());
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		analysis: "O título está legível e centralizado.",
	});
	expect(
		JSON.parse(response.headers.get(USAGE_HEADER) ?? "{}").attempts[0]
			.totalTokens,
	).toBe(130);
	const body = JSON.parse(String(upstream.mock.calls[0][1]?.body));
	expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
	expect(body.contents[0].parts[0].text).toContain("1.500");
	expect(response.headers.get("cache-control")).toContain("no-store");
});
test("quota failures remain visible without leaking credentials", async () => {
	upstream.mockResolvedValue(
		Response.json({ error: { message: "test-personal-key" } }, { status: 429 }),
	);
	const response = await POST(request());
	expect(response.status).toBe(429);
	expect(await response.text()).not.toContain("test-personal-key");
	expect(
		JSON.parse(response.headers.get(USAGE_HEADER) ?? "{}").attempts[0].status,
	).toBe(429);
});
test("aborted visual analysis never starts a provider request", async () => {
	const controller = new AbortController();
	controller.abort();
	const response = await POST(request({ signal: controller.signal }));
	expect([400, 499]).toContain(response.status);
	expect(upstream).not.toHaveBeenCalled();
});
test("empty model responses cannot be reported as successful analysis", async () => {
	upstream.mockResolvedValueOnce(
		Response.json({ candidates: [{ content: { parts: [] } }] }),
	);
	const response = await POST(request());
	expect(response.status).toBe(502);
});
