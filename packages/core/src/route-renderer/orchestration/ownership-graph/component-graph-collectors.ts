import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { EcoComponent, ResolvedLazyTrigger } from '../../../types/public-types.ts';
import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { walkComponentGraph, type ComponentGraphRoot } from './component-graph.ts';
import { getComponentIdentity } from '../../../eco/component-identity.ts';

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
			const integrationName = getComponentIdentity(component)?.integration ?? component.config?.integration;
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
				getComponentIdentity(currentComponent)?.integration ?? currentComponent.config?.integration;
			if (integrationName && integrationName !== currentIntegrationName) {
				foundForeign = true;
				return false;
			}
		},
	});

	return foundForeign;
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
