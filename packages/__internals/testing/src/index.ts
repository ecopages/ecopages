import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoPagesAppConfig,
	EcoComponent,
	EcoPagesElement,
} from '@ecopages/core';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { IntegrationPlugin, type AnyIntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';

export const TEST_RUNTIME_ORIGIN = 'http://localhost:3000';

export type CreateTestAppConfigOptions = {
	baseUrl?: string;
	configure?: (builder: ConfigBuilder) => ConfigBuilder | void;
	description?: string;
	distDir?: string;
	integrations?: AnyIntegrationPlugin[];
	runtimeOrigin?: string;
	title?: string;
};

export type CreateDeferredIntegrationPluginOptions = {
	extensions?: string[];
	name?: string;
	renderComponent?: (input: ComponentRenderInput) => Promise<ComponentRenderResult> | ComponentRenderResult;
};

export async function createTestAppConfig(options: CreateTestAppConfigOptions = {}) {
	const {
		baseUrl = TEST_RUNTIME_ORIGIN,
		configure,
		description = 'Ecopages',
		distDir,
		integrations = [],
		runtimeOrigin = baseUrl,
		title = 'Ecopages',
	} = options;

	let builder = new ConfigBuilder();

	if (distDir) {
		builder = builder.setDistDir(distDir);
	}

	const configuredBuilder = configure?.(builder);
	if (configuredBuilder) {
		builder = configuredBuilder;
	}

	const config = await builder
		.setRobotsTxt({
			preferences: {
				'*': [],
			},
		})
		.setIntegrations(integrations)
		.setDefaultMetadata({
			title,
			description,
		})
		.setBaseUrl(baseUrl)
		.build();

	for (const integration of integrations) {
		integration.setConfig(config);
		integration.setRuntimeOrigin(runtimeOrigin);
	}

	return config;
}

export type { EcoPagesAppConfig, AnyIntegrationPlugin };

export function createDeferredIntegrationPlugin(options: CreateDeferredIntegrationPluginOptions = {}) {
	const integrationName = options.name ?? 'deferred';
	const extensions = options.extensions ?? ['.deferred.tsx'];
	const renderComponent =
		options.renderComponent ??
		(async () => ({
			html: '<button data-testid="deferred-widget">Deferred widget</button>',
			canAttachAttributes: true,
			rootTag: 'button',
			integrationName,
		}));

	class DeferredRenderer extends IntegrationRenderer<EcoPagesElement> {
		name = integrationName;

		async render(): Promise<string> {
			return '';
		}

		override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
			return await renderComponent(input);
		}

		async renderToResponse<P = Record<string, unknown>>(
			_view: EcoComponent<P>,
			_props: P,
			_ctx: RenderToResponseContext,
		) {
			return new Response('');
		}
	}

	return new (class DeferredPlugin extends IntegrationPlugin<EcoPagesElement> {
		renderer = DeferredRenderer;

		constructor() {
			super({
				name: integrationName,
				extensions,
			});
		}
	})();
}
