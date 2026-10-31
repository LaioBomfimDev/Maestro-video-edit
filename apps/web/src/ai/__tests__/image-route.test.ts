import { beforeEach, afterEach, expect, test, spyOn } from "bun:test";
import sharp from "sharp";
import { POST } from "@/app/api/ai/image/route";
import { GEMINI_KEY_HEADER } from "../credentials";
const png = await sharp({
	create: { width: 8, height: 8, channels: 3, background: "#ff0000" },
})
	.png()
	.toBuffer();
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
beforeEach(() => {
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async () => {
				throw new Error("Unexpected provider call");
			},
			{ preconnect: () => {} },
		),
	);
});
afterEach(() => fetchSpy.mockRestore());
function request({
	key = "personal-key-test",
	body = {
		prompt: "Troque o fundo por um estúdio branco",
		mimeType: "image/png",
		data: png.toString("base64"),
	},
}: { key?: string; body?: unknown } = {}) {
	return new Request("https://maestro.example/api/ai/image", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(key ? { [GEMINI_KEY_HEADER]: key } : {}),
		},
		body: JSON.stringify(body),
	});
}
test("image editing requires a personal key and does not contact Google without it", async () => {
	const r = await POST(request({ key: "" }));
	expect(r.status).toBe(503);
	expect(fetchSpy).not.toHaveBeenCalled();
});
test("malformed images are rejected before using provider quota", async () => {
	const r = await POST(
		request({
			body: { prompt: "Editar foto", mimeType: "image/png", data: "YWJjZA==" },
		}),
	);
	expect(r.status).toBe(400);
	expect(fetchSpy).not.toHaveBeenCalled();
});
test("unapproved model names and mime types are rejected", async () => {
	const r = await POST(
		request({
			body: {
				prompt: "Editar foto",
				mimeType: "image/svg+xml",
				data: png.toString("base64"),
				model: "../other",
			},
		}),
	);
	expect(r.status).toBe(400);
	expect(fetchSpy).not.toHaveBeenCalled();
});
test("returns a real WebP without exposing credentials", async () => {
	fetchSpy.mockResolvedValueOnce(
		Response.json({
			candidates: [
				{
					content: {
						parts: [
							{
								inlineData: {
									mimeType: "image/png",
									data: png.toString("base64"),
								},
							},
						],
					},
				},
			],
		}),
	);
	const r = await POST(request());
	expect(r.status).toBe(200);
	expect(r.headers.get("cache-control")).toBe("no-store");
	expect(r.headers.get("content-type")).toBe("image/webp");
	const output = Buffer.from(await r.arrayBuffer());
	expect(output.subarray(0, 4).toString()).toBe("RIFF");
	expect((await sharp(output).metadata()).width).toBe(8);
	expect(String(fetchSpy.mock.calls[0][0])).toContain(
		"models/gemini-nano-banana-2.1:generateContent",
	);
	const init = fetchSpy.mock.calls[0][1];
	expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(
		"personal-key-test",
	);
	expect(String(init?.body)).not.toContain("personal-key-test");
});
test("provider error echoes do not expose a key", async () => {
	fetchSpy.mockResolvedValueOnce(
		Response.json(
			{ error: { message: "Invalid personal-key-test" } },
			{ status: 403 },
		),
	);
	const r = await POST(request());
	expect(r.status).toBe(403);
	expect(await r.text()).not.toContain("personal-key-test");
});
test("text-only and refused results never become a successful image edit", async () => {
	fetchSpy.mockResolvedValueOnce(
		Response.json({
			candidates: [{ content: { parts: [{ text: "Cannot edit" }] } }],
		}),
	);
	const r = await POST(request());
	expect(r.status).toBe(422);
});
test("large request bodies are rejected before provider calls", async () => {
	const req = request();
	req.headers.set("content-length", "4000000");
	const r = await POST(req);
	expect(r.status).toBe(413);
	expect(fetchSpy).not.toHaveBeenCalled();
});
