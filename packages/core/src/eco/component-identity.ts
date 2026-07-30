import type { EcoComponent, EcoComponentConfig } from '../types/public-types.ts';

/** Stable attribution for a Component created by an Integration-owned module. */
export type ComponentIdentity = {
	id: string;
	file: string;
	integration: string;
};

function asConfig(value: EcoComponent | EcoComponentConfig | undefined): EcoComponentConfig | undefined {
	if (!value) return undefined;
	if (typeof value === 'function') return value.config;
	if ('config' in value) return value.config;
	return value as EcoComponentConfig;
}

/** Gets canonical component attribution. */
export function getComponentIdentity(
	value: EcoComponent | EcoComponentConfig | undefined,
): ComponentIdentity | undefined {
	const config = asConfig(value);
	return config?.identity;
}

/** Merges attribution into factory options. */
export function bindComponentIdentity<T extends object>(
	identity: ComponentIdentity,
	options: T,
): T & { identity: ComponentIdentity } {
	return { ...options, identity };
}
