import type { EcoComponentDependencies, EcoComponentConfig, EcoComponent } from '../types/contracts.ts';
import type { ComponentIdentity } from './component-identity.ts';

export type DiscoveredDependencies = {
	components: () => unknown[];
	/** Side-effect stylesheets the declaring module imports itself. */
	stylesheets: string[];
	/** Side-effect stylesheets of the plain local modules the declaring module imports. */
	plainModuleStylesheets?: string[];
	/** The entries of `stylesheets` and `plainModuleStylesheets` whose import named a package. */
	packageStylesheets?: string[];
	watchFiles?: string[];
};

const discoveries = new WeakMap<ComponentIdentity, DiscoveredDependencies>();
const INFERRED_STYLESHEETS = Symbol.for('ecopages.identity.inferredStylesheets');
const PLAIN_MODULE_STYLESHEETS = Symbol.for('ecopages.identity.plainModuleStylesheets');
const PACKAGE_STYLESHEETS = Symbol.for('ecopages.identity.packageStylesheets');
const DISCOVERED_WATCH_FILES = Symbol.for('ecopages.identity.watchFiles');

type IdentityDiscoveryRecord = {
	[INFERRED_STYLESHEETS]?: readonly string[];
	[PLAIN_MODULE_STYLESHEETS]?: readonly string[];
	[PACKAGE_STYLESHEETS]?: readonly string[];
	[DISCOVERED_WATCH_FILES]?: readonly string[];
};

function discoveryRecord(identity: ComponentIdentity): IdentityDiscoveryRecord {
	return identity as ComponentIdentity & IdentityDiscoveryRecord;
}

/**
 * Records discovered Components, inferred styles, and watch paths on identity.
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
	record[PLAIN_MODULE_STYLESHEETS] = discovered.plainModuleStylesheets;
	record[PACKAGE_STYLESHEETS] = discovered.packageStylesheets;
	record[DISCOVERED_WATCH_FILES] = discovered.watchFiles;
}

/**
 * Inferred stylesheet paths registered for this component identity, split by where the import sits.
 *
 * @remarks
 * `imported` are the declaring module's own side-effect imports; `plainModules` come from the plain local
 * modules it imports. `packages` lists those of either whose import named a package. Provenance stays on
 * identity so copying or merging `config.dependencies` cannot turn inferred styles into explicit ones. Paths are stored on the identity object so collection still
 * sees them when server modules bundle a separate copy of `eco`. The collector prefers explicit entries
 * across the whole graph by resolved path.
 */
export function getDiscoveredStylesheets(config: EcoComponentConfig | undefined): {
	imported: readonly string[];
	plainModules: readonly string[];
	packages: readonly string[];
} {
	const identity = config?.identity;
	if (!identity) return { imported: [], plainModules: [], packages: [] };
	const record = discoveryRecord(identity);
	const discovered = discoveries.get(identity);
	return {
		imported: record[INFERRED_STYLESHEETS] ?? discovered?.stylesheets ?? [],
		plainModules: record[PLAIN_MODULE_STYLESHEETS] ?? discovered?.plainModuleStylesheets ?? [],
		packages: record[PACKAGE_STYLESHEETS] ?? discovered?.packageStylesheets ?? [],
	};
}

/**
 * Every inferred stylesheet path registered for this component identity, for watch paths.
 *
 * @remarks
 * A package stylesheet installed under `node_modules` is left out, as the development watcher ignores that
 * directory; one in a linked workspace package stays a watch path.
 */
export function getInferredStylesheets(config: EcoComponentConfig | undefined): readonly string[] {
	const { imported, plainModules } = getDiscoveredStylesheets(config);
	return [...imported, ...plainModules].filter((file) => !file.split(/[\\/]/).includes('node_modules'));
}

/**
 * Watch paths discovery recorded for this component identity.
 *
 * @remarks
 * Barrel hops and walked plain modules are not Component identity files. Collecting them as watch paths
 * lets a barrel retarget or a plain module's import edit invalidate HTML and Page Browser Graph caches
 * without editing the importing Page.
 */
export function getDiscoveredWatchFiles(config: EcoComponentConfig | undefined): readonly string[] {
	const identity = config?.identity;
	if (!identity) return [];
	return discoveryRecord(identity)[DISCOVERED_WATCH_FILES] ?? discoveries.get(identity)?.watchFiles ?? [];
}

function isDeclared(value: unknown): value is EcoComponent {
	return typeof value === 'function' && Boolean((value as EcoComponent).config?.identity);
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
