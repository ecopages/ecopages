import type { EcoComponent, EcoComponentConfig } from '../types/public-types.ts';

/** Stable attribution for a Component created by an Integration-owned module. */
export type ComponentIdentity = {
	id: string;
	file: string;
	integration: string;
};

type ComponentOrConfig = EcoComponent | EcoComponentConfig | undefined;

function asConfig(value: ComponentOrConfig): EcoComponentConfig | undefined {
	if (!value) return undefined;
	if (typeof value === 'function') return value.config;
	if ('config' in value) return value.config;
	return value as EcoComponentConfig;
}

/** Gets canonical component attribution. */
export function getComponentIdentity(value: ComponentOrConfig): ComponentIdentity | undefined {
	const config = asConfig(value);
	return config?.identity;
}

/** Attaches canonical component attribution to a component config. */
export function bindComponentIdentity<T extends EcoComponent>(component: T, identity: ComponentIdentity): T {
	if (!component.config) component.config = {};
	component.config.identity = identity;
	return component;
}
