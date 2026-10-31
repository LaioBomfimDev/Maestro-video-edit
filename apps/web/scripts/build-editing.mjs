import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const crate = path.join(root, "rust/crates/editing");
execFileSync(
	"cargo",
	[
		"build",
		"--manifest-path",
		path.join(crate, "Cargo.toml"),
		"--target",
		"wasm32-unknown-unknown",
		"--release",
	],
	{ stdio: "inherit" },
);
const out = path.join(root, "apps/web/public/editing");
mkdirSync(out, { recursive: true });
copyFileSync(
	path.join(
		crate,
		"target/wasm32-unknown-unknown/release/maestro_editing.wasm",
	),
	path.join(out, "maestro-editing-v1.wasm"),
);
