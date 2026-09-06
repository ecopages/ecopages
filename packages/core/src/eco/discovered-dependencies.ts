import type { EcoComponentDependencies, EcoComponentConfig, EcoDeclaredComponent } from '../types/public-types.ts';
import type { ComponentIdentity } from './component-identity.ts';

export type DiscoveredDependencies = {
	components: () => unknown[];
	stylesheets: string[];
};

const discoveries = new WeakMap<ComponentIdentity, DiscoveredDependencies>();

export function registerDiscoveredDependencies(identity: ComponentIdentity, discovered: DiscoveredDependencies): void {
	discoveries.set(identity, discovered);
}

/**
 * Inferred stylesheet paths registered for this component identity.
 *
 * @remarks
 * Provenance stays on identity so copying or merging `config.dependencies` cannot
 * turn inferred styles into explicit ones. The collector prefers explicit entries
 * across the whole graph by resolved path.
 */
export function getInferredStylesheets(config: EcoComponentConfig | undefined): readonly string[] {
	const identity = config?.identity;
	return identity ? (discoveries.get(identity)?.stylesheets ?? []) : [];
}

function isDeclared(value: unknown): value is EcoDeclaredComponent {
	return typeof value === 'function' && Boolean((value as EcoDeclaredComponent).config?.identity);
}

/**
 * Attaches deferred discovered Component references to `config.dependencies`.
 *
 * @remarks
 * The component getter reads live import bindings only during graph traversal,
 * after module initialization. Inferred stylesheets stay keyed by identity and are
 * not copied into the public bag, so rendering, SSR preload, ownership, and watch
 * collectors share the same graph without object-identity bookkeeping.
 */
export function attachDiscoveredDependencies(config: EcoComponentConfig): void {
	const discovery = config.identity && discoveries.get(config.identity);
	if (!discovery) return;
	let explicit = config.dependencies;
	let merged: EcoComponentDependencies;
	const merge = () => {
		const current = explicit;
		merged = {
			...current,
			get components() {
				return [...new Set([...(current?.components ?? []), ...discovery.components().filter(isDeclared)])];
			},
		};
	};
	merge();
	Object.defineProperty(config, 'dependencies', {
		enumerable: true,
		configurable: true,
		get: () => merged,
		set: (value: EcoComponentDependencies | undefined) => {
			explicit = value;
			merge();
		},
	});
}
