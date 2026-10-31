import { adjustmentEffectDefinition } from "./adjustment";
import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { colorEffectDefinitions } from "./color";

const defaultEffects = [
	blurEffectDefinition,
	...colorEffectDefinitions,
	adjustmentEffectDefinition,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
