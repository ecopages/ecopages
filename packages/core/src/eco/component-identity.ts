import type { EcoComponent, EcoComponentConfig } from '../types/public-types.ts';
import { registerDiscoveredDependencies, type DiscoveredDependencies } from './discovered-dependencies.ts';

/** Stable attribution for a Component created by an Integration-owned module. */
export type ComponentIdentity = {
	id: string;
	file: string;
	integration: string;
};

type OwnedValue = EcoComponent | Partial<EcoComponent> | Pick<EcoComponentConfig, 'integration' | 'identity'>;

function asConfig(value: OwnedValue | undefined | null): EcoComponentConfig | undefined {
	if (!value) return undefined;
	if (typeof value === 'function') return value.config;
	if ('config' in value) return value.config;
	return value as EcoComponentConfig;
}

/** Gets canonical component attribution. */
export function getComponentIdentity(value: OwnedValue | undefined | null): ComponentIdentity | undefined {
	const config = asConfig(value);
	return config?.identity;
}

/**
 * Names the Integration that owns a Component.
 *
 * @remarks
 * One rule decides ownership for rendering, hydration, dependency collection and validation: the
 * `integration` override on the Component's config, then the Integration of the file that created it
 * (its identity), then `inheritedOwner`, which is the owner of the parent Component, or of the Page
 * at the root. A Component with none of them has no owner, so a caller that passes no
 * `inheritedOwner` gets `undefined`.
 */
export function getComponentOwner(value: OwnedValue | undefined | null, inheritedOwner: string): string;
export function getComponentOwner(value: OwnedValue | undefined | null): string | undefined;
export function getComponentOwner(value: OwnedValue | undefined | null, inheritedOwner?: string): string | undefined {
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
