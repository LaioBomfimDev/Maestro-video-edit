import type { MediaTime } from "@/wasm";
import { roundMediaTime } from "@/wasm";
import type { EditorCore } from "@/core";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import type { ExportOptions, ExportResult } from "@/export";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { SceneExporter } from "@/services/renderer/scene-exporter";
import { buildScene } from "@/services/renderer/scene-builder";
import { createTimelineAudioBuffer } from "@/media/audio";
import { formatTimecode } from "opencut-wasm";
import { downloadBlob } from "@/utils/browser";

type SnapshotResult =
	| { success: true; blob: Blob; filename: string }
	| { success: false; error: string };

export class RendererManager {
	private renderTree: RootNode | null = null;
	private previewCapture: {
		time: number;
		projectId: string;
		sceneId: string;
		finish: (
			result:
				| { time: MediaTime; data: string; width: number; height: number }
				| Error,
		) => void;
	} | null = null;

	hasPendingPreviewCapture(): boolean {
		return this.previewCapture !== null;
	}

	capturePreviewFrame({ signal }: { signal?: AbortSignal } = {}): Promise<{
		time: MediaTime;
		data: string;
		width: number;
		height: number;
	}> {
		signal?.throwIfAborted();
		if (this.previewCapture)
			return Promise.reject(
				new Error("Uma captura visual já está em andamento."),
			);
		if (!this.renderTree || this.editor.timeline.getTotalDuration() === 0)
			return Promise.reject(
				new Error("Adicione conteúdo à timeline antes de analisar a imagem."),
			);
		this.editor.playback.pause();
		const expectedTime = Math.min(
			this.editor.playback.getCurrentTime(),
			this.editor.timeline.getLastFrameTime(),
		);
		return new Promise((resolve, reject) => {
			const onAbort = () => finish(new DOMException("Aborted", "AbortError"));
			const timer = setTimeout(
				() =>
					finish(
						new Error(
							"A prévia não ficou pronta para captura. Aguarde o carregamento da mídia e tente novamente.",
						),
					),
				10000,
			);
			const finish = (
				result:
					| { time: MediaTime; data: string; width: number; height: number }
					| Error,
			) => {
				clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
				this.previewCapture = null;
				if (result instanceof Error) reject(result);
				else resolve(result);
			};
			this.previewCapture = {
				time: expectedTime,
				projectId: this.editor.project.getActive().metadata.id,
				sceneId: this.editor.scenes.getActiveScene().id,
				finish,
			};
			signal?.addEventListener("abort", onAbort, { once: true });
		});
	}

	completePreviewCapture({
		canvas,
		time,
		renderTree,
	}: {
		canvas: HTMLCanvasElement;
		time: number;
		renderTree: RootNode;
	}): void {
		const capture = this.previewCapture;
		if (!capture) return;
		try {
			if (
				capture.projectId !== this.editor.project.getActive().metadata.id ||
				capture.sceneId !== this.editor.scenes.getActiveScene().id
			)
				throw new Error("A cena mudou durante a captura.");
			if (
				Math.min(
					this.editor.playback.getCurrentTime(),
					this.editor.timeline.getLastFrameTime(),
				) !== capture.time
			)
				throw new Error(
					"A posição da prévia mudou durante a captura. Tente novamente.",
				);
			if (renderTree !== this.renderTree || time !== capture.time) return;
			const ratio = Math.min(1, 960 / Math.max(canvas.width, canvas.height));
			const output = document.createElement("canvas");
			output.width = Math.max(1, Math.round(canvas.width * ratio));
			output.height = Math.max(1, Math.round(canvas.height * ratio));
			const context = output.getContext("2d");
			if (!context)
				throw new Error("Não foi possível capturar a prévia neste navegador.");
			context.drawImage(canvas, 0, 0, output.width, output.height);
			const data = output.toDataURL("image/jpeg", 0.78).split(",")[1];
			if (!data || data.length > 800000)
				throw new Error("O quadro capturado ficou muito grande.");
			capture.finish({
				time: roundMediaTime({ time }),
				data,
				width: output.width,
				height: output.height,
			});
		} catch (error) {
			capture.finish(
				error instanceof Error ? error : new Error("Falha ao capturar quadro."),
			);
		}
	}

	failPreviewCapture({ error }: { error: unknown }): void {
		this.previewCapture?.finish(
			error instanceof Error
				? error
				: new Error("Não foi possível renderizar o quadro para análise."),
		);
	}

	private _isDegraded = false;
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	get isDegraded(): boolean {
		return this._isDegraded;
	}

	setDegraded(degraded: boolean): void {
		if (this._isDegraded === degraded) return;
		this._isDegraded = degraded;
		this.notify();
	}

	setRenderTree({ renderTree }: { renderTree: RootNode | null }): void {
		this.renderTree = renderTree;
		this.notify();
	}

	getRenderTree(): RootNode | null {
		return this.renderTree;
	}

	async saveSnapshot(): Promise<{ success: boolean; error?: string }> {
		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		downloadBlob({ blob: snapshot.blob, filename: snapshot.filename });
		return { success: true };
	}

	async copySnapshot(): Promise<{ success: boolean; error?: string }> {
		if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
			return {
				success: false,
				error: "Clipboard image copy is not supported in this browser",
			};
		}

		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					[snapshot.blob.type || "image/png"]: snapshot.blob,
				}),
			]);
			return { success: true };
		} catch (error) {
			console.error("Copy snapshot failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	private async createSnapshot(): Promise<SnapshotResult> {
		try {
			const renderTree = this.getRenderTree();
			const activeProject = this.editor.project.getActive();

			if (!renderTree || !activeProject) {
				return { success: false, error: "No project or scene to capture" };
			}

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const { canvasSize, fps } = activeProject.settings;
			const renderTime = Math.min(
				this.editor.playback.getCurrentTime(),
				this.editor.timeline.getLastFrameTime(),
			);

			const renderer = new CanvasRenderer({
				width: canvasSize.width,
				height: canvasSize.height,
				fps,
			});

			const tempCanvas = document.createElement("canvas");
			tempCanvas.width = canvasSize.width;
			tempCanvas.height = canvasSize.height;

			await renderer.renderToCanvas({
				node: renderTree,
				time: renderTime,
				targetCanvas: tempCanvas,
			});

			const blob = await new Promise<Blob | null>((resolve) => {
				tempCanvas.toBlob((result) => resolve(result), "image/png");
			});

			if (!blob) {
				return { success: false, error: "Failed to create image" };
			}

			const timecode = formatTimecode({ time: renderTime, rate: fps })!.replace(
				/:/g,
				"-",
			);
			const safeName =
				activeProject.metadata.name.replace(/[<>:"/\\|?*]/g, "-").trim() ||
				"snapshot";
			const filename = `${safeName}-${timecode}.png`;

			return { success: true, blob, filename };
		} catch (error) {
			console.error("Snapshot capture failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async exportProject({
		options,
		onProgress,
		onCancel,
	}: {
		options: ExportOptions;
		onProgress?: ({ progress }: { progress: number }) => void;
		onCancel?: () => boolean;
	}): Promise<ExportResult> {
		const { format, quality, fps, includeAudio } = options;

		try {
			const tracks = this.editor.scenes.getActiveScene().tracks;
			const mediaAssets = this.editor.media.getAssets();
			const activeProject = this.editor.project.getActive();

			if (!activeProject) {
				return { success: false, error: "No active project" };
			}

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const exportFps = fps ?? activeProject.settings.fps;
			const canvasSize = activeProject.settings.canvasSize;

			let audioBuffer: AudioBuffer | null = null;
			if (includeAudio) {
				onProgress?.({ progress: 0.05 });
				audioBuffer = await createTimelineAudioBuffer({
					tracks,
					mediaAssets,
					duration,
				});
			}

			const scene = buildScene({
				tracks,
				mediaAssets,
				duration,
				canvasSize,
				background: activeProject.settings.background,
			});

			const exporter = new SceneExporter({
				width: canvasSize.width,
				height: canvasSize.height,
				fps: exportFps,
				format,
				quality,
				shouldIncludeAudio: !!includeAudio,
				audioBuffer: audioBuffer || undefined,
			});

			exporter.on("progress", (progress) => {
				const adjustedProgress = includeAudio
					? 0.05 + progress * 0.95
					: progress;
				onProgress?.({ progress: adjustedProgress });
			});

			let cancelled = false;
			const checkCancel = () => {
				if (onCancel?.()) {
					cancelled = true;
					exporter.cancel();
				}
			};

			const cancelInterval = setInterval(checkCancel, 100);

			try {
				const buffer = await exporter.export({ rootNode: scene });
				clearInterval(cancelInterval);

				if (cancelled) {
					return { success: false, cancelled: true };
				}

				if (!buffer) {
					return { success: false, error: "Export failed to produce buffer" };
				}

				return {
					success: true,
					buffer,
				};
			} finally {
				clearInterval(cancelInterval);
			}
		} catch (error) {
			console.error("Export failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown export error",
			};
		}
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
