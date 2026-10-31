// ABI of rust/crates/editing. Version the asset URL when its ABI changes.
export interface EditingEngine {
	quota_accumulate(
		field: number,
		current: number,
		at: number,
		now: number,
		sameDay: number,
		input: number,
		total: number,
		status: number,
	): number;
	quota_remaining(limit: number, observed: number, incomplete: number): number;
	transition_time(point: number, duration: number, requested: number): number;
	transition_value(
		preset: number,
		mode: number,
		channel: number,
		point: number,
		base: number,
		extent: number,
	): number;
	cut_count(duration: number, interval: number): number;
}

let pending: Promise<EditingEngine> | undefined;

export function loadEditingEngine(): Promise<EditingEngine> {
	if (!pending) {
		pending = fetch("/editing/maestro-editing-v1.wasm")
			.then(async (response) => {
				if (!response.ok)
					throw new Error(
						"Não foi possível carregar as ferramentas de edição.",
					);
				const { instance } = await WebAssembly.instantiate(
					await response.arrayBuffer(),
					{},
				);
				const {
					transition_time,
					transition_value,
					cut_count,
					quota_accumulate,
					quota_remaining,
				} = instance.exports;
				if (
					typeof transition_time !== "function" ||
					typeof transition_value !== "function" ||
					typeof cut_count !== "function" ||
					typeof quota_accumulate !== "function" ||
					typeof quota_remaining !== "function"
				)
					throw new Error("Módulo de edição incompatível.");
				return {
					transition_time: (...args) => Number(transition_time(...args)),
					transition_value: (...args) => Number(transition_value(...args)),
					cut_count: (...args) => Number(cut_count(...args)),
					quota_accumulate: (...args) => Number(quota_accumulate(...args)),
					quota_remaining: (...args) => Number(quota_remaining(...args)),
				} satisfies EditingEngine;
			})
			.catch((error: unknown) => {
				pending = undefined;
				throw error;
			});
	}
	return pending;
}
