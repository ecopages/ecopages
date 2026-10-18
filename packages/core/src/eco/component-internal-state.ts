import type { AssetDefinition, EcoComponentConfig, ResolvedLazyTrigger } from '../types/contracts.ts';

type ComponentInternalState = {
	resolvedLazyTriggers?: ResolvedLazyTrigger[];
	pendingLazyClientAssets?: AssetDefinition[];
};

const stateByConfig = new WeakMap<EcoComponentConfig, ComponentInternalState>();

export function getResolvedLazyTriggers(config: EcoComponentConfig | undefined): ResolvedLazyTrigger[] | undefined {
	return config ? stateByConfig.get(config)?.resolvedLazyTriggers : undefined;
}

export function setResolvedLazyTriggers(config: EcoComponentConfig, triggers: ResolvedLazyTrigger[] | undefined): void {
	const state = stateByConfig.get(config) ?? {};
	state.resolvedLazyTriggers = triggers;
	stateByConfig.set(config, state);
}

export function getPendingLazyClientAssets(config: EcoComponentConfig | undefined): AssetDefinition[] | undefined {
	return config ? stateByConfig.get(config)?.pendingLazyClientAssets : undefined;
}

export function setPendingLazyClientAssets(config: EcoComponentConfig, assets: AssetDefinition[] | undefined): void {
	const state = stateByConfig.get(config) ?? {};
	state.pendingLazyClientAssets = assets;
	stateByConfig.set(config, state);
}
