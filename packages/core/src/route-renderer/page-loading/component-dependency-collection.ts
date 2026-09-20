import path from 'node:path';
import type { DependencyLazyTrigger, EcoComponent, EcoComponentDependencies } from '../../types/public-types.ts';
import { assertEcoDeclaredComponent } from '../../eco/eco-declared-component.ts';
import { getComponentIdentity } from '../../eco/component-identity.ts';
import { getInferredStylesheets } from '../../eco/discovered-dependencies.ts';
import type { AssetDefinition } from '../../services/assets/asset-processing-service/index.ts';
import { AssetFactory } from '../../services/assets/asset-processing-service/index.ts';
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
	resolveLazyScripts: (componentDir: string, scripts: string[]) => string;
	createEcopagesJsxLazyEntryName: (integrationName: string, key: string) => string;
	isEcopagesJsxIntegration: (integrationName: string) => boolean;
	errors: {
		invalidStylesheetEntry: string;
		invalidScriptEntry: string;
		lazyScriptMissingSrc: string;
	};
};

type ComponentDependencyCollectionContext = {
	integrationName: string;
	resolveLazyScripts: CollectComponentDependenciesOptions['resolveLazyScripts'];
	createEcopagesJsxLazyEntryName: CollectComponentDependenciesOptions['createEcopagesJsxLazyEntryName'];
	isEcopagesJsxIntegration: CollectComponentDependenciesOptions['isEcopagesJsxIntegration'];
	errors: CollectComponentDependenciesOptions['errors'];
	dependencies: AssetDefinition[];
	lazyScriptsByConfig: Map<NonNullable<EcoComponent['config']>, Map<string, LazyGroup>>;
	lazyDependencyKeys: Set<string>;
	visited: Set<NonNullable<EcoComponent['config']>>;
	inferredStyles: Array<{ dir: string; src: string }>;
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
	context: Pick<ComponentDependencyCollectionContext, 'explicitStylePaths' | 'inferredStyles'>,
): NonNullable<EcoComponentDependencies['stylesheets']> {
	const dependenciesConfig = config.dependencies;
	const explicitStyles = dependenciesConfig?.stylesheets ?? [];

	for (const style of explicitStyles) {
		const src = typeof style === 'string' ? style : style.src;
		if (src) context.explicitStylePaths.add(resolveDependencyPath(dir, src));
	}

	for (const src of getInferredStylesheets(config)) {
		context.inferredStyles.push({ dir, src });
	}

	return explicitStyles;
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

	const file = getComponentIdentity(config)?.file;
	if (!file) return;
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
		componentFile: file,
		componentDir: dir,
		integrationName: context.integrationName,
		dependencies: context.dependencies,
		lazyDependencyKeys: context.lazyDependencyKeys,
		registerLazyScript,
		resolveDependencyPath,
		resolveLazyScripts: context.resolveLazyScripts,
		createModuleScriptAttributes,
		createEcopagesJsxLazyEntryName: context.createEcopagesJsxLazyEntryName,
		pushUniqueDependency,
		getLazyScriptMissingSrcMessage: () => context.errors.lazyScriptMissingSrc,
		isEcopagesJsxIntegration: context.isEcopagesJsxIntegration,
	});

	for (const nestedComponent of dependenciesConfig?.components ?? []) {
		if (!nestedComponent) {
			continue;
		}

		assertEcoDeclaredComponent(nestedComponent, { parentComponentFile: file });
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
 * resolved path already has an explicit entry. The returned structures preserve both
 * the flat asset list used by asset processing and the grouped lazy-trigger data used
 * later during render output.
 */
export function collectComponentDependencies(
	options: CollectComponentDependenciesOptions,
): CollectedComponentDependencies {
	const {
		components,
		integrationName,
		resolveLazyScripts,
		createEcopagesJsxLazyEntryName,
		isEcopagesJsxIntegration,
		errors,
	} = options;
	const dependencies: AssetDefinition[] = [];
	const lazyScriptsByConfig = new Map<NonNullable<EcoComponent['config']>, Map<string, LazyGroup>>();
	const lazyDependencyKeys = new Set<string>();
	const visited = new Set<NonNullable<EcoComponent['config']>>();
	const inferredStyles: Array<{ dir: string; src: string }> = [];
	const explicitStylePaths = new Set<string>();

	for (const component of components) {
		if (!component) continue;

		const componentFile = getComponentIdentity(component)?.file;
		if (!componentFile) continue;

		const collectionContext: ComponentDependencyCollectionContext = {
			integrationName,
			resolveLazyScripts,
			createEcopagesJsxLazyEntryName,
			isEcopagesJsxIntegration,
			errors,
			dependencies,
			lazyScriptsByConfig,
			lazyDependencyKeys,
			visited,
			inferredStyles,
			explicitStylePaths,
			stylesheetDependencyKeys: new Set<string>(),
			scriptDependencyKeys: new Set<string>(),
			modulesMap: new Map<string, Set<string> | null>(),
		};

		collectComponentConfigDependencies(component.config, collectionContext);

		const { modulesMap } = collectionContext;

		dependencies.push(
			...Array.from(modulesMap.entries()).map(([from, importsSet]) => {
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
			}),
		);
	}

	for (const { dir, src } of inferredStyles) {
		const filepath = resolveDependencyPath(dir, src);
		if (explicitStylePaths.has(filepath)) continue;
		explicitStylePaths.add(filepath);
		dependencies.push(
			AssetFactory.createFileStylesheet({ filepath, position: 'head', attributes: { rel: 'stylesheet' } }),
		);
	}
	return {
		dependencies,
		lazyScriptsByConfig,
	};
}
