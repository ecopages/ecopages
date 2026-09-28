import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { AssetProcessingService } from '../services/assets/asset-processing-service/asset-processing.service.ts';
import type { ProcessedAsset } from '../services/assets/asset-processing-service/assets.types.ts';
import type { EcoPagesElement } from '../types/public-types.ts';
import type { IntegrationRenderer } from '../route-renderer/orchestration/integration-renderer.ts';
import { IntegrationPlugin, type IntegrationPluginConfig } from './integration-plugin.ts';

type RendererClass<C> = new (options: {
	appConfig: EcoPagesAppConfig;
	assetProcessingService: AssetProcessingService;
	resolvedIntegrationDependencies: ProcessedAsset[];
	rendererModules?: unknown;
	runtimeOrigin: string;
}) => IntegrationRenderer<C>;

export interface DefineIntegrationDefinition<C = EcoPagesElement> extends IntegrationPluginConfig {
	renderer: RendererClass<C>;
}

export interface DefinedIntegration<C = EcoPagesElement> {
	(options?: Omit<IntegrationPluginConfig, 'name'>): IntegrationPlugin<C>;
	Plugin: new (options?: Omit<IntegrationPluginConfig, 'name'>) => IntegrationPlugin<C>;
}

/**
 * Creates a typed integration plugin factory for integrations that only need
 * declarative config and a renderer class.
 */
export function defineIntegration<C = EcoPagesElement>(
	definition: DefineIntegrationDefinition<C>,
): DefinedIntegration<C> {
	const { renderer, ...defaultConfig } = definition;

	class DefinedIntegrationPlugin extends IntegrationPlugin<C> {
		renderer = renderer;

		constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
			super({
				...defaultConfig,
				...options,
			});
		}
	}

	const factory = ((options?: Omit<IntegrationPluginConfig, 'name'>) =>
		new DefinedIntegrationPlugin(options)) as DefinedIntegration<C>;

	factory.Plugin = DefinedIntegrationPlugin;

	return factory;
}
