"use client";

import { useEffect } from "react";

// Portalled dialogs and sheets must share the space left by the mobile keyboard.
export function VisualViewport() {
	useEffect(() => {
		const viewport = window.visualViewport;
		let frame = 0;
		const update = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				document.documentElement.style.setProperty(
					"--app-viewport-height",
					`${viewport?.height ?? window.innerHeight}px`,
				);
				document.documentElement.style.setProperty(
					"--app-viewport-top",
					`${viewport?.offsetTop ?? 0}px`,
				);
			});
		};
		update();
		window.addEventListener("resize", update);
		viewport?.addEventListener("resize", update);
		viewport?.addEventListener("scroll", update);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("resize", update);
			viewport?.removeEventListener("resize", update);
			viewport?.removeEventListener("scroll", update);
			document.documentElement.style.removeProperty("--app-viewport-height");
			document.documentElement.style.removeProperty("--app-viewport-top");
		};
	}, []);
	return null;
}
