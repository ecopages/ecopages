import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { EcoComponent, ResolvedLazyTrigger } from '../../../types/public-types.ts';
import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { walkComponentGraph, type ComponentGraphRoot } from './component-graph.ts';
import { getComponentIdentity } from '../../../eco/component-identity.ts';
import { collectPageClientPlan } from './page-client-plan.ts';

function toGraphRoots(components: (EcoComponent | Partial<EcoComponent>)[]): ComponentGraphRoot[] {
	return components.filter(Boolean).map((component) => ({ component }));
}

export function collectIntegrationNamesFromGraph(
	components: (EcoComponent | Partial<EcoComponent>)[],
	currentIntegrationName: string,
): Set<string> {
	return collectPageClientPlan(components, currentIntegrationName).integrationNames;
}

export function collectResolvedLazyTriggersFromGraph(
	components: (EcoComponent | Partial<EcoComponent>)[],
	currentIntegrationName: string,
): ResolvedLazyTrigger[] {
	return collectPageClientPlan(components, currentIntegrationName).lazyTriggers;
}

export function hasForeignChildDescendantsInGraph(
	component: EcoComponent,
	currentIntegrationName: string,
	foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
): boolean {
	let foundForeign = false;

	walkComponentGraph({
		roots: toGraphRoots([component, ...(foreignChildRoots ?? [])]),
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

export function collectUsedIntegrationDependenciesFromNames(
	appConfig: EcoPagesAppConfig,
	integrationNames: Iterable<string>,
	currentIntegrationName: string,
): ProcessedAsset[] {
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

export function collectUsedIntegrationDependenciesFromGraph(
	appConfig: EcoPagesAppConfig,
	components: (EcoComponent | Partial<EcoComponent>)[],
	currentIntegrationName: string,
): ProcessedAsset[] {
	return collectUsedIntegrationDependenciesFromNames(
		appConfig,
		collectIntegrationNamesFromGraph(components, currentIntegrationName),
		currentIntegrationName,
	);
}
