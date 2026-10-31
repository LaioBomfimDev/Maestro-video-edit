import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
const { instance } = await WebAssembly.instantiate(
	await readFile(
		new URL("../../../public/editing/maestro-editing-v1.wasm", import.meta.url),
	),
	{},
);
const { quota_accumulate, quota_remaining } = instance.exports;
if (
	typeof quota_accumulate !== "function" ||
	typeof quota_remaining !== "function"
)
	throw new Error("Quota module missing");
test("shipped quota module expires rolling windows and keeps unknown totals unknown", () => {
	expect(quota_accumulate(0, 2, 0, 59999, 1, 100, 150, 200)).toBe(3);
	expect(quota_accumulate(0, 2, 0, 60000, 1, 100, 150, 200)).toBe(2);
	expect(quota_accumulate(2, 0, 0, 60000, 0, 100, 150, 200)).toBe(0);
	expect(quota_accumulate(1, 0, 100, 200, 1, 100, 150, 200)).toBe(100);
	expect(Number.isNaN(Number(quota_remaining(1000, 100, 1)))).toBe(true);
	expect(quota_remaining(1000, 100, 0)).toBe(900);
});
