import { expect, test } from "bun:test";
import { clearFontAtlasCache, loadFullFont } from "../google-fonts";

async function withDocument(
	run: (
		links: {
			href: string;
			onload: (() => void) | null;
			onerror: (() => void) | null;
			remove: () => void;
		}[],
		setFailure: (failure: boolean) => void,
	) => Promise<void>,
) {
	const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
	const links: {
		href: string;
		onload: (() => void) | null;
		onerror: (() => void) | null;
		remove: () => void;
	}[] = [];
	let fail = false;
	const document = {
		createElement: () => ({
			href: "",
			onload: null,
			onerror: null,
			remove: () => {},
		}),
		head: {
			appendChild: (link: (typeof links)[number]) => {
				links.push(link);
				queueMicrotask(() => {
					if (fail || link.href.includes("Single+Weight:wght"))
						link.onerror?.();
					else link.onload?.();
				});
			},
		},
		fonts: { load: async () => [{}] },
	};
	Object.defineProperty(globalThis, "document", {
		value: document,
		configurable: true,
	});
	clearFontAtlasCache();
	try {
		await run(links, (value) => {
			fail = value;
		});
	} finally {
		if (previous) Object.defineProperty(globalThis, "document", previous);
		else Reflect.deleteProperty(globalThis, "document");
		clearFontAtlasCache();
	}
}

test("single-weight display fonts retry without unsupported weights", async () => {
	await withDocument(async (links) => {
		await loadFullFont({ family: "Single Weight" });
		expect(links).toHaveLength(2);
		expect(links[1].href).not.toContain(":wght");
	});
});

test("concurrent font requests share one stylesheet and cache a successful load", async () => {
	await withDocument(async (links) => {
		await Promise.all([
			loadFullFont({ family: "Concurrent Font" }),
			loadFullFont({ family: "Concurrent Font" }),
		]);
		await loadFullFont({ family: "Concurrent Font" });
		expect(links).toHaveLength(1);
	});
});

test("failed fonts can be retried after connectivity returns", async () => {
	await withDocument(async (links, setFailure) => {
		setFailure(true);
		await expect(loadFullFont({ family: "Retry Font" })).rejects.toThrow();
		setFailure(false);
		await loadFullFont({ family: "Retry Font" });
		expect(links).toHaveLength(3);
	});
});
