import type { EcoComponent, EcoComponentConfig } from '../types/contracts.ts';
import type { ComponentIdentity } from '../types/component-identity.ts';
import { registerDiscoveredDependencies, type DiscoveredDependencies } from './discovered-dependencies.ts';

export type { ComponentIdentity } from '../types/component-identity.ts';

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

/**
 * Resolves the Integration that owns a component.
 *
 * @remarks An explicit component override takes precedence over build-time identity, then the inherited owner.
 */
export function getComponentOwner(value: EcoComponent | EcoComponentConfig | undefined, inheritedOwner: string): string;
export function getComponentOwner(
	value: EcoComponent | EcoComponentConfig | undefined,
	inheritedOwner?: string,
): string | undefined;
export function getComponentOwner(
	value: EcoComponent | EcoComponentConfig | undefined,
	inheritedOwner?: string,
): string | undefined {
	const config = asConfig(value);
	return config?.integration ?? config?.identity?.integration ?? inheritedOwner;
}

/** Merges attribution into factory options. Optional discovered stylesheets stay keyed by identity. */
export function bindComponentIdentity<T extends object>(
	identity: ComponentIdentity,
	options: T,
	discovered?: DiscoveredDependencies,
): T & { identity: ComponentIdentity } {
	if (discovered) registerDiscoveredDependencies(identity, discovered);
	return { ...options, identity };
}
