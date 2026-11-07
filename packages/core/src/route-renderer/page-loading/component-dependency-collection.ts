import { path } from '@ecopages/file-system/path';
import type { DependencyLazyTrigger, EcoComponent, EcoComponentDependencies } from '../../types/contracts.ts';
import { assertEcoDeclaredComponent } from '../../eco/eco-declared-component.ts';
import { getComponentIdentity, getComponentOwner } from '../../eco/component-identity.ts';
import { resolveDiscoveredStylesheets } from '../../eco/discovered-dependency-paths.ts';
import type { AssetDefinition } from '../../assets/asset-processing-service/index.ts';
import { AssetFactory } from '../../assets/asset-processing-service/index.ts';
import { extractEcopagesVirtualImports } from './ecopages-virtual-imports.ts';
import { collectDeclaredAssetEntries } from './declared-asset-collection.ts';
import { getLazyTriggerKey } from './lazy-trigger-planning.ts';
import { collectLazyScriptEntries, type LazyGroup } from './lazy-entry-collection.ts';
import {
	createModuleScriptName,
	createNamedImportModuleSource,
	createNamespaceImportModuleSource,
} from './module-declaration-scripts.ts';
import { collectModuleDeclarations } from './module-declaration-aggregation.ts';

const MODULE_SCRIPT_ATTRIBUTES = {
	type: 'module',
	defer: '',
} as const;

function createModuleScriptAttributes(attributes?: Record<string, string>): Record<string, string> {
	return {
		...MODULE_SCRIPT_ATTRIBUTES,
		...attributes,
	};
}

function pushUniqueDependency(
	keys: Set<string>,
	key: string,
	dependencies: AssetDefinition[],
	dependency: AssetDefinition,
): boolean {
	if (keys.has(key)) {
		return false;
	}

	keys.add(key);
	dependencies.push(dependency);
	return true;
}

function resolveDependencyPath(componentDir: string, pathUrl: string): string {
	return path.isAbsolute(pathUrl) ? pathUrl : path.join(componentDir, pathUrl);
}

/**
 * Aggregated dependency output for one dependency-collection pass.
 */
export type CollectedComponentDependencies = {
	/**
	 * Flat asset declarations ready for downstream processing.
	 */
	dependencies: AssetDefinition[];
	/**
	 * Lazy script groups keyed by component config and trigger key.
	 */
	lazyScriptsByConfig: Map<NonNullable<EcoComponent['config']>, Map<string, LazyGroup>>;
};

type CollectComponentDependenciesOptions = {
	components: Array<EcoComponent | Partial<EcoComponent> | undefined | null>;
	integrationName: string;
	/** The app root that root-relative identity files and discovered stylesheets resolve against. */
	rootDir: string;
	/**
	 * Skips nested components owned by another Integration, and their descendants.
	 *
	 * @remarks Those are Foreign Children: their owning Integration renders them and emits their assets.
	 */
	excludeForeignChildren?: boolean;
	/**
	 * Treats each supplied component as an already flattened graph node.
	 */
	skipNestedComponents?: boolean;
	resolveLazyScripts: (componentDir: string, scripts: string[]) => string;
	createEcopagesJsxLazyEntryName: (integrationName: string, key: string) => string;
	errors: {
		invalidStylesheetEntry: string;
		invalidScriptEntry: string;
		lazyScriptMissingSrc: string;
	};
};

type ComponentDependencyCollectionContext = {
	integrationName: string;
	rootDir: string;
	excludeForeignChildren: boolean;
	skipNestedComponents: boolean;
	resolveLazyScripts: CollectComponentDependenciesOptions['resolveLazyScripts'];
	createEcopagesJsxLazyEntryName: CollectComponentDependenciesOptions['createEcopagesJsxLazyEntryName'];
	errors: CollectComponentDependenciesOptions['errors'];
	dependencies: AssetDefinition[];
	lazyScriptsByConfig: Map<NonNullable<EcoComponent['config']>, Map<string, LazyGroup>>;
	lazyDependencyKeys: Set<string>;
	visited: Set<NonNullable<EcoComponent['config']>>;
	inferredStyles: InferredStyle[];
	packageStylePaths: Map<string, string>;
	explicitStylePaths: Set<string>;
	stylesheetDependencyKeys: Set<string>;
	scriptDependencyKeys: Set<string>;
	modulesMap: Map<string, Set<string> | null>;
};

function createLazyScriptRegistrar(
	config: NonNullable<EcoComponent['config']>,
	lazyScriptsByConfig: Map<NonNullable<EcoComponent['config']>, Map<string, LazyGroup>>,
) {
	return ({ lazy, lazyKey, fallbackUrl }: { lazy: DependencyLazyTrigger; lazyKey: string; fallbackUrl?: string }) => {
		let grouped = lazyScriptsByConfig.get(config);
		if (!grouped) {
			grouped = new Map<string, LazyGroup>();
			lazyScriptsByConfig.set(config, grouped);
		}

		const triggerKey = getLazyTriggerKey(lazy);
		const existing = grouped.get(triggerKey) ?? { lazy, scripts: [] };
		existing.scripts.push({ lazyKey, fallbackUrl });
		grouped.set(triggerKey, existing);
	};
}

function recordExplicitAndInferredStyles(
	config: NonNullable<EcoComponent['config']>,
	dir: string,
	context: Pick<
		ComponentDependencyCollectionContext,
		'explicitStylePaths' | 'inferredStyles' | 'packageStylePaths' | 'rootDir'
	>,
): NonNullable<EcoComponentDependencies['stylesheets']> {
	const dependenciesConfig = config.dependencies;
	const explicitStyles = dependenciesConfig?.stylesheets ?? [];

	for (const style of explicitStyles) {
		const src = typeof style === 'string' ? style : style.src;
		if (src) context.explicitStylePaths.add(resolveDependencyPath(dir, src));
	}

	const discovered = resolveDiscoveredStylesheets(config, context.rootDir);
	for (const filepath of discovered.imported) {
		context.inferredStyles.push({ filepath, plainModule: false });
	}
	for (const filepath of discovered.plainModules) {
		context.inferredStyles.push({ filepath, plainModule: true });
	}
	for (const [filepath, packagePath] of discovered.packagePaths) {
		context.packageStylePaths.set(filepath, packagePath);
	}

	return explicitStyles;
}

type InferredStyle = { filepath: string; plainModule: boolean };

/**
 * Orders inferred stylesheets once each, leaving out paths with an explicit entry.
 *
 * @remarks
 * A declaration's own import keeps its first position. A stylesheet that only plain modules import takes
 * the position of its last occurrence, so it follows the CSS of every declaration that imports its module.
 */
function orderInferredStylesheets(styles: InferredStyle[], explicitStylePaths: ReadonlySet<string>): string[] {
	const positions = new Map<string, { index: number; plainModule: boolean }>();
	styles.forEach(({ filepath, plainModule }, index) => {
		if (explicitStylePaths.has(filepath)) return;
		const known = positions.get(filepath);
		if (!known || (known.plainModule && !plainModule)) {
			positions.set(filepath, { index, plainModule });
		} else if (known.plainModule) {
			known.index = index;
		}
	});
	return [...positions].sort(([, left], [, right]) => left.index - right.index).map(([filepath]) => filepath);
}

/**
 * @remarks A nested component without an Integration inherits its parent's, so it is not a Foreign Child.
 */
function isForeignChild(component: EcoComponent, integrationName: string): boolean {
	return getComponentOwner(component, integrationName) !== integrationName;
}

/**
 * Recursively visits one component config and its declared child dependencies.
 */
function collectComponentConfigDependencies(
	config: EcoComponent['config'],
	context: ComponentDependencyCollectionContext,
): void {
	if (!config || context.visited.has(config)) return;
	context.visited.add(config);

	const identityFile = getComponentIdentity(config)?.file;
	if (!identityFile) return;
	const file = path.resolve(context.rootDir, identityFile);
	const dir = path.dirname(file);
	const explicitStyles = recordExplicitAndInferredStyles(config, dir, context);
	const dependenciesConfig = config.dependencies;
	const registerLazyScript = createLazyScriptRegistrar(config, context.lazyScriptsByConfig);

	collectDeclaredAssetEntries({
		stylesheetEntries: explicitStyles,
		scriptEntries: dependenciesConfig?.scripts ?? [],
		componentDir: dir,
		dependencies: context.dependencies,
		stylesheetDependencyKeys: context.stylesheetDependencyKeys,
		scriptDependencyKeys: context.scriptDependencyKeys,
		resolveDependencyPath,
		createModuleScriptAttributes,
		pushUniqueDependency,
		getInvalidStylesheetEntryMessage: () => context.errors.invalidStylesheetEntry,
		getInvalidScriptEntryMessage: () => context.errors.invalidScriptEntry,
	});

	collectModuleDeclarations(context.modulesMap, dependenciesConfig?.modules, extractEcopagesVirtualImports(file));

	collectLazyScriptEntries({
		scriptEntries: dependenciesConfig?.scripts ?? [],
		rootDir: context.rootDir,
		componentFile: file,
		componentDir: dir,
		integrationName: getComponentOwner(config, context.integrationName),
		dependencies: context.dependencies,
		lazyDependencyKeys: context.lazyDependencyKeys,
		registerLazyScript,
		resolveDependencyPath,
		resolveLazyScripts: context.resolveLazyScripts,
		createModuleScriptAttributes,
		createEcopagesJsxLazyEntryName: context.createEcopagesJsxLazyEntryName,
		pushUniqueDependency,
		getLazyScriptMissingSrcMessage: () => context.errors.lazyScriptMissingSrc,
	});

	collectNestedComponentDependencies(dependenciesConfig?.components ?? [], file, context);
}

function collectNestedComponentDependencies(
	nestedComponents: NonNullable<EcoComponentDependencies['components']>,
	parentComponentFile: string,
	context: ComponentDependencyCollectionContext,
): void {
	for (const nestedComponent of nestedComponents) {
		if (!nestedComponent) {
			continue;
		}

		assertEcoDeclaredComponent(nestedComponent, { parentComponentFile });
		if (context.skipNestedComponents) {
			continue;
		}
		if (context.excludeForeignChildren && isForeignChild(nestedComponent, context.integrationName)) {
			continue;
		}
		collectComponentConfigDependencies(nestedComponent.config, context);
	}
}

/**
 * Walks component dependency trees and collects declared assets, module declarations,
 * and lazy-script group metadata in one pass.
 *
 * @remarks
 * Explicit stylesheet declarations are collected first across the graph. Inferred
 * stylesheets are read from component identity afterward and skipped when the same
 * resolved path already has an explicit entry (see {@link orderInferredStylesheets}). One a package import named
 * carries its package path as `fromPackage`. The returned structures preserve both
 * the flat asset list used by asset processing and the grouped lazy-trigger data used
 * later during render output.
 */
export function collectComponentDependencies(
	options: CollectComponentDependenciesOptions,
): CollectedComponentDependencies {
	const {
		components,
		integrationName,
		rootDir,
		excludeForeignChildren = false,
		skipNestedComponents = false,
		resolveLazyScripts,
		createEcopagesJsxLazyEntryName,
		errors,
	} = options;
	const dependencies: AssetDefinition[] = [];
	const lazyScriptsByConfig = new Map<NonNullable<EcoComponent['config']>, Map<string, LazyGroup>>();
	const lazyDependencyKeys = new Set<string>();
	const visited = new Set<NonNullable<EcoComponent['config']>>();
	const inferredStyles: InferredStyle[] = [];
	const packageStylePaths = new Map<string, string>();
	const explicitStylePaths = new Set<string>();
	const modulesMap = new Map<string, Set<string> | null>();
	const preparedStylesheetDependencyKeys = skipNestedComponents ? new Set<string>() : undefined;
	const preparedScriptDependencyKeys = skipNestedComponents ? new Set<string>() : undefined;

	for (const component of components) {
		if (!component) continue;

		const componentFile = getComponentIdentity(component)?.file;
		if (!componentFile) continue;

		const collectionContext: ComponentDependencyCollectionContext = {
			integrationName,
			rootDir,
			excludeForeignChildren,
			skipNestedComponents,
			resolveLazyScripts,
			createEcopagesJsxLazyEntryName,
			errors,
			dependencies,
			lazyScriptsByConfig,
			lazyDependencyKeys,
			visited,
			inferredStyles,
			packageStylePaths,
			explicitStylePaths,
			stylesheetDependencyKeys: preparedStylesheetDependencyKeys ?? new Set<string>(),
			scriptDependencyKeys: preparedScriptDependencyKeys ?? new Set<string>(),
			modulesMap,
		};

		collectComponentConfigDependencies(component.config, collectionContext);
	}
	dependencies.push(...createModuleDependencies(modulesMap));

	for (const filepath of orderInferredStylesheets(inferredStyles, explicitStylePaths)) {
		dependencies.push(
			AssetFactory.createFileStylesheet({
				filepath,
				position: 'head',
				attributes: { rel: 'stylesheet' },
				...(packageStylePaths.has(filepath) ? { fromPackage: packageStylePaths.get(filepath) } : {}),
			}),
		);
	}
	return {
		dependencies,
		lazyScriptsByConfig,
	};
}

function createModuleDependencies(modulesMap: Map<string, Set<string> | null>): AssetDefinition[] {
	return Array.from(modulesMap.entries()).map(([from, importsSet]) => {
		const imports = importsSet ? Array.from(importsSet) : undefined;
		return AssetFactory.createContentScript({
			position: 'head',
			name: createModuleScriptName(from, imports),
			content:
				imports && imports.length > 0
					? createNamedImportModuleSource(from, imports)
					: createNamespaceImportModuleSource(from),
			attributes: createModuleScriptAttributes(),
		});
	});
}
