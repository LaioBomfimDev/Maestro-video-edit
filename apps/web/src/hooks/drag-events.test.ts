import { describe, expect, test } from "bun:test";
import { listenForDrag } from "./drag-events";

function fire({
	target,
	type,
	id = 7,
	x = 10,
}: {
	target: EventTarget;
	type: string;
	id?: number;
	x?: number;
}) {
	const event = new Event(type);
	Object.assign(event, { pointerId: id, clientX: x, clientY: 0 });
	target.dispatchEvent(event);
}

describe("timeline drag input", () => {
	test("touch tracks only the initiating finger, commits once and removes listeners", () => {
		const target = new EventTarget();
		const positions: number[] = [];
		let ended = 0;
		let cancelled = 0;
		listenForDrag({
			source: { type: "pointerdown", pointerId: 7 },
			target,
			onMove: (event) => positions.push(event.clientX),
			onEnd: () => ended++,
			onCancel: () => cancelled++,
		});
		fire({ target, type: "pointermove", id: 8 });
		fire({ target, type: "pointerup", id: 8 });
		fire({ target, type: "pointermove", x: 42 });
		fire({ target, type: "pointerup" });
		fire({ target, type: "pointermove", x: 99 });
		fire({ target, type: "pointerup" });
		expect(positions).toEqual([42]);
		expect(ended).toBe(1);
		expect(cancelled).toBe(0);
	});
	test("interrupted touch cancels without committing movement", () => {
		const target = new EventTarget();
		let ended = 0;
		let cancelled = 0;
		listenForDrag({
			source: { type: "pointerdown", pointerId: 7 },
			target,
			onMove: () => {},
			onEnd: () => ended++,
			onCancel: () => cancelled++,
		});
		fire({ target, type: "pointercancel", id: 8 });
		expect(cancelled).toBe(0);
		fire({ target, type: "pointercancel" });
		fire({ target, type: "pointerup" });
		expect(cancelled).toBe(1);
		expect(ended).toBe(0);
	});
	test("mouse input retains movement and release behavior", () => {
		const target = new EventTarget();
		const positions: number[] = [];
		let ended = 0;
		listenForDrag({
			source: { type: "mousedown" },
			target,
			onMove: (event) => positions.push(event.clientX),
			onEnd: () => ended++,
			onCancel: () => {},
		});
		fire({ target, type: "pointermove" });
		fire({ target, type: "mousemove", x: 32 });
		fire({ target, type: "mouseup" });
		expect(positions).toEqual([32]);
		expect(ended).toBe(1);
	});
	test("unmount cleanup discards pending pointer listeners", () => {
		const target = new EventTarget();
		let calls = 0;
		const cleanup = listenForDrag({
			source: { type: "pointerdown", pointerId: 7 },
			target,
			onMove: () => calls++,
			onEnd: () => calls++,
			onCancel: () => calls++,
		});
		cleanup();
		cleanup();
		for (const type of ["pointermove", "pointerup", "pointercancel"])
			fire({ target, type });
		expect(calls).toBe(0);
	});
});
