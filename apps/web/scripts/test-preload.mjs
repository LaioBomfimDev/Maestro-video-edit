import { mock } from "bun:test";
import { readFile } from "node:fs/promises";
import { Canvas } from "@napi-rs/canvas";
import * as bindings from "opencut-wasm/opencut_wasm_bg.js";

// Text measurement needs a real 2D context in the headless test runner.
if (typeof globalThis.OffscreenCanvas === "undefined") {
	globalThis.OffscreenCanvas = Canvas;
}

// The published package targets bundlers. Bun 1.2 imports .wasm as a file path,
// so initialize the real Rust module explicitly before tests import its facade.
const wasmUrl = new URL(
	"./opencut_wasm_bg.wasm",
	import.meta.resolve("opencut-wasm"),
);
const { instance } = await WebAssembly.instantiate(await readFile(wasmUrl), {
	"./opencut_wasm_bg.js": bindings,
});
bindings.__wbg_set_wasm(instance.exports);
instance.exports.__wbindgen_start();

mock.module("opencut-wasm", () => bindings);
