import path from 'node:path';
import type { DependencyLazyTrigger, EcoComponent } from '../../types/public-types.ts';
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
	return path.join(componentDir, pathUrl);
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

/**
 * Walks component dependency trees and collects declared assets, module declarations,
 * and lazy-script group metadata in one pass.
 *
 * The returned structures intentionally preserve both the flat asset list used by
 * asset processing and the grouped lazy-trigger data used later during render output.
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

		const stylesheetDependencyKeys = new Set<string>();
		const scriptDependencyKeys = new Set<string>();
		const modulesMap = new Map<string, Set<string> | null>();

		/**
		 * Recursively visits one component config and its declared child dependencies.
		 */
		const collect = (config: EcoComponent['config']) => {
			if (!config || visited.has(config)) return;
			visited.add(config);

			const file = getComponentIdentity(config)?.file;
			if (!file) return;
			const dir = path.dirname(file);
			const dependenciesConfig = config.dependencies;
			const discoveredStyles = getInferredStylesheets(dependenciesConfig);
			const explicitStyles = (dependenciesConfig?.stylesheets ?? []).slice(
				0,
				(dependenciesConfig?.stylesheets?.length ?? 0) - discoveredStyles.length,
			);
			for (const style of explicitStyles) {
				const src = typeof style === 'string' ? style : style.src;
				if (src) explicitStylePaths.add(resolveDependencyPath(dir, src));
			}
			for (const src of discoveredStyles) inferredStyles.push({ dir, src });

			const registerLazyScript = ({
				lazy,
				lazyKey,
				fallbackUrl,
			}: {
				lazy: DependencyLazyTrigger;
				lazyKey: string;
				fallbackUrl?: string;
			}) => {
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

			collectDeclaredAssetEntries({
				stylesheetEntries: explicitStyles,
				scriptEntries: dependenciesConfig?.scripts ?? [],
				componentDir: dir,
				dependencies,
				stylesheetDependencyKeys,
				scriptDependencyKeys,
				resolveDependencyPath,
				createModuleScriptAttributes,
				pushUniqueDependency,
				getInvalidStylesheetEntryMessage: () => errors.invalidStylesheetEntry,
				getInvalidScriptEntryMessage: () => errors.invalidScriptEntry,
			});

			collectModuleDeclarations(modulesMap, dependenciesConfig?.modules, extractEcopagesVirtualImports(file));

			collectLazyScriptEntries({
				scriptEntries: dependenciesConfig?.scripts ?? [],
				componentFile: file,
				componentDir: dir,
				integrationName,
				dependencies,
				lazyDependencyKeys,
				registerLazyScript,
				resolveDependencyPath,
				resolveLazyScripts,
				createModuleScriptAttributes,
				createEcopagesJsxLazyEntryName,
				pushUniqueDependency,
				getLazyScriptMissingSrcMessage: () => errors.lazyScriptMissingSrc,
				isEcopagesJsxIntegration,
			});

			if (dependenciesConfig?.components) {
				for (const nestedComponent of dependenciesConfig.components) {
					if (!nestedComponent) {
						continue;
					}

					assertEcoDeclaredComponent(nestedComponent, { parentComponentFile: file });
					collect(nestedComponent.config);
				}
			}
		};

		collect(component.config);

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
