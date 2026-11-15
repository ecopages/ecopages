import type { EcoComponent, EcoComponentDependencies } from '../../types/contracts.ts';
import { assertEcoDeclaredComponent } from '../../eco/eco-declared-component.ts';
import { getComponentIdentity, getComponentOwner } from '../../eco/component-identity.ts';
import type { AssetDefinition } from '../../assets/asset-processing-service/index.ts';
import { AssetFactory } from '../../assets/asset-processing-service/index.ts';
import { getLazyTriggerKey } from './lazy-trigger-planning.ts';
import type { LazyGroup } from './lazy-entry-collection.ts';
import {
	createModuleScriptName,
	createNamedImportModuleSource,
	createNamespaceImportModuleSource,
} from './module-declaration-scripts.ts';
import { mergeModuleDeclaration } from './module-declaration-aggregation.ts';
import { createModuleScriptAttributes } from './declared-asset-collection.ts';
import {
	createLazyEntryName,
	type ComponentDeclarations,
	type ComponentDeclarationStore,
	type InferredStyle,
} from './component-declarations.ts';

function pushUniqueDependency(
	keys: Set<string>,
	key: string,
	dependencies: AssetDefinition[],
	dependency: AssetDefinition,
): void {
	if (keys.has(key)) return;
	keys.add(key);
	dependencies.push(dependency);
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
	/** The declarations of each component config the walk reaches. */
	declarations: ComponentDeclarationStore;
	/**
	 * Treats each supplied component as an already flattened graph node.
	 */
	skipNestedComponents?: boolean;
};

type ComponentDependencyCollectionContext = {
	integrationName: string;
	declarations: ComponentDeclarationStore;
	skipNestedComponents: boolean;
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

/** Adds one config's declarations to the pass, skipping assets an earlier config already added. */
function mergeComponentDeclarations(
	config: NonNullable<EcoComponent['config']>,
	declarations: ComponentDeclarations,
	context: ComponentDependencyCollectionContext,
): void {
	for (const filepath of declarations.explicitStylePaths) context.explicitStylePaths.add(filepath);
	context.inferredStyles.push(...declarations.inferredStyles);
	for (const [filepath, packagePath] of declarations.packageStylePaths)
		context.packageStylePaths.set(filepath, packagePath);

	for (const { kind, key, asset } of declarations.assets) {
		const keys = kind === 'stylesheet' ? context.stylesheetDependencyKeys : context.scriptDependencyKeys;
		pushUniqueDependency(keys, key, context.dependencies, asset);
	}

	for (const declaration of declarations.modules) mergeModuleDeclaration(context.modulesMap, declaration);

	if (declarations.lazyScripts.length === 0) return;
	const owner = getComponentOwner(config, context.integrationName);
	let groups = context.lazyScriptsByConfig.get(config);
	if (!groups) {
		groups = new Map<string, LazyGroup>();
		context.lazyScriptsByConfig.set(config, groups);
	}
	for (const script of declarations.lazyScripts) {
		pushUniqueDependency(
			context.lazyDependencyKeys,
			script.key,
			context.dependencies,
			script.createAsset(createLazyEntryName(owner, script.entryHash)),
		);
		const triggerKey = getLazyTriggerKey(script.lazy);
		const group = groups.get(triggerKey) ?? { lazy: script.lazy, scripts: [] };
		group.scripts.push({ lazyKey: script.lazyKey, fallbackUrl: script.fallbackUrl });
		groups.set(triggerKey, group);
	}
}

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
 * Recursively visits one component config and its declared child dependencies.
 */
function collectComponentConfigDependencies(
	config: EcoComponent['config'],
	context: ComponentDependencyCollectionContext,
): void {
	if (!config || context.visited.has(config)) return;
	context.visited.add(config);

	const declarations = context.declarations.get(config);
	if (!declarations) return;
	mergeComponentDeclarations(config, declarations, context);
	collectNestedComponentDependencies(config.dependencies?.components ?? [], declarations.file, context);
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
	const { components, integrationName, declarations, skipNestedComponents = false } = options;
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
			declarations,
			skipNestedComponents,
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
