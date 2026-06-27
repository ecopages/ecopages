import path from 'node:path';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { DependencyAttributes, EcoComponent, ResolvedLazyTrigger } from '../../types/public-types.ts';
import type { AssetDefinition } from '../../services/assets/asset-processing-service/index.ts';
import { AssetFactory } from '../../services/assets/asset-processing-service/index.ts';
import type { AssetProcessingService, ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import { walkComponentGraph, type ComponentGraphRoot } from './component-graph.ts';

function toGraphRoots(components: (EcoComponent | Partial<EcoComponent>)[]): ComponentGraphRoot[] {
	return components.filter(Boolean).map((component) => ({ component }));
}

export function collectIntegrationNamesFromGraph(
	components: (EcoComponent | Partial<EcoComponent>)[],
	currentIntegrationName: string,
): Set<string> {
	const integrationNames = new Set<string>();

	walkComponentGraph({
		roots: toGraphRoots(components),
		currentIntegrationName,
		onComponent: ({ component }) => {
			const integrationName = component.config?.integration ?? component.config?.__eco?.integration;
			if (integrationName) {
				integrationNames.add(integrationName);
			}
		},
	});

	return integrationNames;
}

export function collectResolvedLazyTriggersFromGraph(
	components: (EcoComponent | Partial<EcoComponent>)[],
	currentIntegrationName: string,
): ResolvedLazyTrigger[] {
	const triggers: ResolvedLazyTrigger[] = [];

	walkComponentGraph({
		roots: toGraphRoots(components),
		currentIntegrationName,
		onComponent: ({ component }) => {
			const ownTriggers = component.config?._resolvedLazyTriggers;
			if (ownTriggers?.length) {
				triggers.push(...ownTriggers);
			}
		},
	});

	return triggers;
}

export function hasForeignChildDescendantsInGraph(component: EcoComponent, currentIntegrationName: string): boolean {
	let foundForeign = false;

	walkComponentGraph({
		roots: [{ component }],
		currentIntegrationName,
		onComponent: ({ component: currentComponent }) => {
			if (foundForeign) {
				return false;
			}

			const integrationName =
				currentComponent.config?.integration ?? currentComponent.config?.__eco?.integration;
			if (integrationName && integrationName !== currentIntegrationName) {
				foundForeign = true;
				return false;
			}
		},
	});

	return foundForeign;
}

export function collectEagerSsrLazyScriptDefinitions(
	components: (EcoComponent | Partial<EcoComponent>)[],
): AssetDefinition[] {
	const dependencies: AssetDefinition[] = [];
	const seenKeys = new Set<string>();

	const normalizeAttributes = (attributes?: DependencyAttributes) => ({
		type: 'module',
		defer: '',
		...(attributes ?? {}),
	});

	walkComponentGraph({
		roots: toGraphRoots(components),
		currentIntegrationName: '',
		visitLayout: true,
		onConfig: (config) => {
			const componentFile = config?.__eco?.file;
			if (!componentFile) {
				return;
			}

			const componentDir = path.dirname(componentFile);
			for (const script of config.dependencies?.scripts ?? []) {
				if (typeof script === 'string' || !script.lazy || script.ssr !== true) {
					continue;
				}

				const attributes = normalizeAttributes(script.attributes);

				if (script.content) {
					const key = `content:${script.content}:${JSON.stringify(attributes)}`;
					if (seenKeys.has(key)) {
						continue;
					}

					seenKeys.add(key);
					dependencies.push(
						AssetFactory.createContentScript({
							position: 'head',
							content: script.content,
							attributes,
							packageRole: 'dynamic-chunk',
						}),
					);
					continue;
				}

				if (!script.src) {
					continue;
				}

				const resolvedPath = path.resolve(componentDir, script.src);
				const key = `file:${resolvedPath}:${JSON.stringify(attributes)}`;
				if (seenKeys.has(key)) {
					continue;
				}

				seenKeys.add(key);
				dependencies.push(
					AssetFactory.createFileScript({
						filepath: resolvedPath,
						position: 'head',
						attributes,
						packageRole: 'dynamic-chunk',
					}),
				);
			}
		},
	});

	return dependencies;
}

export function collectUsedIntegrationDependenciesFromGraph(
	appConfig: EcoPagesAppConfig,
	components: (EcoComponent | Partial<EcoComponent>)[],
	currentIntegrationName: string,
): ProcessedAsset[] {
	const integrationNames = collectIntegrationNamesFromGraph(components, currentIntegrationName);
	const dependencies: ProcessedAsset[] = [];

	for (const integrationName of integrationNames) {
		if (integrationName === currentIntegrationName) {
			continue;
		}

		const integrationPlugin = appConfig.integrations.find((integration) => integration.name === integrationName);
		if (!integrationPlugin || typeof integrationPlugin.getResolvedIntegrationDependencies !== 'function') {
			continue;
		}

		dependencies.push(...integrationPlugin.getResolvedIntegrationDependencies());
	}

	return dependencies;
}

export async function buildEagerSsrLazyAssetsFromGraph(
	assetProcessingService: AssetProcessingService,
	components: (EcoComponent | Partial<EcoComponent>)[],
	currentIntegrationName: string,
): Promise<ProcessedAsset[]> {
	const dependencies = collectEagerSsrLazyScriptDefinitions(components);
	if (dependencies.length === 0) {
		return [];
	}

	return assetProcessingService.processDependencies(dependencies, `${currentIntegrationName}:ssr-lazy`);
}
