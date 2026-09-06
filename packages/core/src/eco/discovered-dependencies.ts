import type { EcoComponentDependencies, EcoComponentConfig, EcoDeclaredComponent } from '../types/public-types.ts';
import type { ComponentIdentity } from './component-identity.ts';

export type DiscoveredDependencies = {
	components: () => unknown[];
	stylesheets: string[];
	watchFiles?: string[];
};

const discoveries = new WeakMap<ComponentIdentity, DiscoveredDependencies>();
const INFERRED_STYLESHEETS = Symbol.for('ecopages.identity.inferredStylesheets');
const DISCOVERED_WATCH_FILES = Symbol.for('ecopages.identity.watchFiles');

type IdentityDiscoveryRecord = {
	[INFERRED_STYLESHEETS]?: readonly string[];
	[DISCOVERED_WATCH_FILES]?: readonly string[];
};

function discoveryRecord(identity: ComponentIdentity): IdentityDiscoveryRecord {
	return identity as ComponentIdentity & IdentityDiscoveryRecord;
}

/**
 * Records discovered Components, inferred styles, and barrel watch hops on identity.
 *
 * @remarks
 * Styles and watch hops are stored on the identity object through interned symbols so
 * a bundled copy of this module still sees them during collection. The component getter
 * stays on a same-isolate WeakMap and is attached to `config.dependencies` at factory time.
 */
export function registerDiscoveredDependencies(identity: ComponentIdentity, discovered: DiscoveredDependencies): void {
	discoveries.set(identity, discovered);
	const record = discoveryRecord(identity);
	record[INFERRED_STYLESHEETS] = discovered.stylesheets;
	record[DISCOVERED_WATCH_FILES] = discovered.watchFiles;
}

/**
 * Inferred stylesheet paths registered for this component identity.
 *
 * @remarks
 * Provenance stays on identity so copying or merging `config.dependencies` cannot
 * turn inferred styles into explicit ones. Paths are stored on the identity object
 * so collection still sees them when server modules bundle a separate copy of `eco`.
 * The collector prefers explicit entries across the whole graph by resolved path.
 */
export function getInferredStylesheets(config: EcoComponentConfig | undefined): readonly string[] {
	const identity = config?.identity;
	if (!identity) return [];
	return discoveryRecord(identity)[INFERRED_STYLESHEETS] ?? discoveries.get(identity)?.stylesheets ?? [];
}

/**
 * Named re-export hops recorded for this component identity.
 *
 * @remarks
 * Barrel files are not Component identity files. Collecting them as watch paths
 * lets a barrel retarget invalidate HTML and Page Browser Graph caches without
 * editing the importing Page.
 */
export function getDiscoveredWatchFiles(config: EcoComponentConfig | undefined): readonly string[] {
	const identity = config?.identity;
	if (!identity) return [];
	return discoveryRecord(identity)[DISCOVERED_WATCH_FILES] ?? discoveries.get(identity)?.watchFiles ?? [];
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
