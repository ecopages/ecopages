import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import { ensureIntegrationRuntimeReady } from '../../../build/app-build-manifest-runtime.ts';
import { invariant } from '../../../utils/invariant.ts';
import type { ForeignSubtreeExecutionOwningRenderer } from './foreign-subtree-execution.service.ts';

export type OwningRendererResolutionInput = {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	currentIntegrationName: string;
	currentRenderer: ForeignSubtreeExecutionOwningRenderer;
	integrationName: string;
	cache: Map<string, ForeignSubtreeExecutionOwningRenderer>;
};

/**
 * Resolves an owning integration renderer for a foreign-child handoff.
 *
 * Reuses the execution-scoped cache, activates the target runtime when needed,
 * and initializes the plugin renderer once per integration name.
 */
export async function resolveOwningIntegrationRenderer(
	input: OwningRendererResolutionInput,
): Promise<ForeignSubtreeExecutionOwningRenderer> {
	const { integrationName, cache } = input;

	if (cache.has(integrationName)) {
		return cache.get(integrationName) as ForeignSubtreeExecutionOwningRenderer;
	}

	if (integrationName === input.currentIntegrationName) {
		cache.set(integrationName, input.currentRenderer);
		return input.currentRenderer;
	}

	await ensureIntegrationRuntimeReady({
		appConfig: input.appConfig,
		integrationName,
		runtimeOrigin: input.runtimeOrigin,
	});

	const integrationPlugin = input.appConfig.integrations.find((integration) => integration.name === integrationName);
	invariant(!!integrationPlugin, `[ecopages] Integration not found for foreign owner: ${integrationName}`);
	const renderer = integrationPlugin.initializeRenderer({
		rendererModules: input.appConfig.runtime?.rendererModuleContext,
	});
	cache.set(integrationName, renderer);
	return renderer;
}
