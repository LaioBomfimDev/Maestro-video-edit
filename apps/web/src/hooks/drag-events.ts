// DOM input adapter shared by mouse, touch and pen timeline gestures.
export function listenForDrag({
	source,
	onMove,
	onEnd,
	onCancel,
	target = document,
}: {
	source: { type: string; pointerId?: number };
	onMove: (event: MouseEvent) => void;
	onEnd: (event: MouseEvent) => void;
	onCancel: () => void;
	target?: EventTarget;
}): () => void {
	const pointer = source.type.startsWith("pointer");
	const moveType = pointer ? "pointermove" : "mousemove";
	const endType = pointer ? "pointerup" : "mouseup";
	const matches = (event: Event) =>
		!pointer || ("pointerId" in event && event.pointerId === source.pointerId);
	const isPositionEvent = (event: Event): event is MouseEvent =>
		"clientX" in event && "clientY" in event;
	const move = (event: Event) => {
		if (matches(event) && isPositionEvent(event)) onMove(event);
	};
	const cleanup = () => {
		target.removeEventListener(moveType, move);
		target.removeEventListener(endType, end);
		target.removeEventListener("pointercancel", cancel);
	};
	const end = (event: Event) => {
		if (!matches(event) || !isPositionEvent(event)) return;
		cleanup();
		onEnd(event);
	};
	const cancel = (event: Event) => {
		if (!matches(event)) return;
		cleanup();
		onCancel();
	};
	target.addEventListener(moveType, move);
	target.addEventListener(endType, end);
	if (pointer) target.addEventListener("pointercancel", cancel);
	return cleanup;
}
