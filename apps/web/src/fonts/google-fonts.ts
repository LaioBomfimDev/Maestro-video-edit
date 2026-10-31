import type { FontAtlas } from "@/fonts/types";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";

const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com/css2";
const FONT_ATLAS_PATH = "/fonts/font-atlas.json";
const FONT_CHUNK_PATH_PREFIX = "/fonts/font-chunk-";

const fullLoaded = new Set<string>();
const loadingFonts = new Map<string, Promise<void>>();

let cachedAtlas: FontAtlas | null = null;
let atlasFetchPromise: Promise<FontAtlas | null> | null = null;

function encodeGoogleFontsFamily(family: string): string {
	return encodeURIComponent(family).replace(/%20/g, "+");
}

export function getCachedFontAtlas(): FontAtlas | null {
	return cachedAtlas;
}

export function clearFontAtlasCache(): void {
	cachedAtlas = null;
	atlasFetchPromise = null;
	fullLoaded.clear();
}

export function loadFontAtlas(): Promise<FontAtlas | null> {
	if (cachedAtlas) return Promise.resolve(cachedAtlas);
	if (atlasFetchPromise) return atlasFetchPromise;

	atlasFetchPromise = fetch(FONT_ATLAS_PATH)
		.then(async (response) => {
			if (!response.ok) return null;
			const data: FontAtlas = await response.json();
			cachedAtlas = data;
			preloadChunkImages({ atlas: data });
			return data;
		})
		.catch(() => null);

	return atlasFetchPromise;
}

function preloadChunkImages({ atlas }: { atlas: FontAtlas }): void {
	const maxChunk = Math.max(
		...Object.values(atlas.fonts).map((entry) => entry.ch),
	);
	for (let i = 0; i <= maxChunk; i++) {
		// hint browser to preload chunk images without blocking
		const img = new Image();
		img.src = `${FONT_CHUNK_PATH_PREFIX}${i}.avif`;
	}
}

export async function loadFullFont({
	family,
	weights = [400, 700],
}: {
	family: string;
	weights?: number[];
}): Promise<void> {
	if (fullLoaded.has(family)) return;
	const existing = loadingFonts.get(family);
	if (existing) return existing;
	const pending = (async () => {
		const prefix = `${GOOGLE_FONTS_CSS}?family=${encodeGoogleFontsFamily(family)}`;
		try {
			await loadFontStylesheet(
				`${prefix}:wght@${[...new Set(weights)].sort((a, b) => a - b).join(";")}&display=swap`,
			);
		} catch {
			// Display families often only have one weight; allow browser-synthesized bold.
			await loadFontStylesheet(`${prefix}&display=swap`);
		}
		const faces = await Promise.all(
			weights.map((weight) =>
				document.fonts.load(`${weight} 16px "${family.replace(/"/g, '\\"')}"`),
			),
		);
		if (!faces.some((group) => group.length))
			throw new Error(`Não foi possível carregar ${family}.`);
		fullLoaded.add(family);
	})();
	loadingFonts.set(family, pending);
	try {
		await pending;
	} finally {
		loadingFonts.delete(family);
	}
}

async function loadFontStylesheet(url: string): Promise<void> {
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = url;
	await new Promise<void>((resolve, reject) => {
		const finish = (success: boolean) => {
			clearTimeout(timer);
			link.onload = null;
			link.onerror = null;
			if (success) resolve();
			else {
				link.remove();
				reject(new Error("Não foi possível baixar a fonte."));
			}
		};
		const timer = setTimeout(() => finish(false), 8000);
		link.onload = () => finish(true);
		link.onerror = () => finish(false);
		document.head.appendChild(link);
	});
}

export async function loadFonts({
	families,
}: {
	families: string[];
}): Promise<void> {
	const googleFonts = families.filter((family) => !SYSTEM_FONTS.has(family));
	await Promise.all(googleFonts.map((family) => loadFullFont({ family })));
}
