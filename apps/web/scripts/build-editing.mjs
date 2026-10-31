import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
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

const { instance } = await WebAssembly.instantiate(
	readFileSync(path.join(out, "maestro-editing-v1.wasm")),
	{},
);
const sounds = [
	["whoosh", "Passagem de ar", "Transi��es"],
	["swoosh", "Varredura r�pida", "Transi��es"],
	["impact", "Impacto grave", "Impactos"],
	["pop", "Pop", "Interface"],
	["click", "Clique", "Interface"],
	["notification", "Notifica��o", "Alertas"],
	["message", "Mensagem", "Alertas"],
	["riser", "Subida de tens�o", "Transi��es"],
	["downer", "Descida", "Transi��es"],
	["kick", "Bumbo", "Percuss�o"],
	["snare", "Caixa", "Percuss�o"],
	["hat", "Chimbal", "Percuss�o"],
	["clap", "Palma", "Percuss�o"],
	["sparkle", "Brilho", "Alertas"],
	["success", "Conquista", "Alertas"],
	["ambient", "Atmosfera suave", "Ambientes"],
	["glitch", "Falha digital", "Impactos"],
	["pulse", "Pulso de suspense", "Ambientes"],
];
const audioOut = path.join(root, "apps/web/public/sounds/maestro");
mkdirSync(audioOut, { recursive: true });
const rate = 44100;
const catalog = sounds.map(([id, name, category], kind) => {
	const duration = instance.exports.sound_duration(kind);
	const count = Math.ceil(duration * rate);
	const wav = Buffer.alloc(44 + count * 2);
	wav.write("RIFF");
	wav.writeUInt32LE(wav.length - 8, 4);
	wav.write("WAVEfmt ", 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(rate, 24);
	wav.writeUInt32LE(rate * 2, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write("data", 36);
	wav.writeUInt32LE(count * 2, 40);
	for (let i = 0; i < count; i++)
		wav.writeInt16LE(
			Math.round(instance.exports.sound_sample(kind, i, rate) * 32767),
			44 + i * 2,
		);
	writeFileSync(path.join(audioOut, id + ".wav"), wav);
	return {
		id,
		name,
		category,
		duration,
		url: "/sounds/maestro/" + id + ".wav",
	};
});
writeFileSync(
	path.join(root, "apps/web/src/sounds/builtin-catalog.json"),
	JSON.stringify(catalog, null, 2) + "\n",
);
