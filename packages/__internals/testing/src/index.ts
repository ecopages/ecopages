import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoPagesAppConfig,
	EcoComponent,
	EcoPagesElement,
} from '@ecopages/core';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { defineIntegration } from '@ecopages/core/plugins/define-integration';
import { IntegrationPlugin, type AnyIntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
} from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { StringMarkupRenderer } from '@ecopages/core/route-renderer/orchestration/string-markup-renderer';

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

export const TEST_STRING_MARKUP_INTEGRATION_NAME = 'string';
export const TEST_STRING_MARKUP_EXTENSIONS = ['.string.ts'] as const;

export type CreateStringMarkupIntegrationOptions = {
	/** File suffixes owned by the test Integration. @default ['.string.ts'] */
	extensions?: string[];
	/** Integration name used for ownership metadata. @default 'string' */
	name?: string;
};

/**
 * Creates a test-only Integration for Components that return HTML strings.
 *
 * @remarks
 * The default Integration is named `string` and owns `.string.ts` files. It uses
 * `StringMarkupRenderer`, so its markup is trusted and interpolation is not
 * escaped. Fixture apps that keep plain `.ts` templates must pass
 * `extensions: ['.ts']` explicitly. Use it only in tests and fixtures.
 */
export function createStringMarkupIntegration(
	options: CreateStringMarkupIntegrationOptions = {},
): AnyIntegrationPlugin {
	const integrationName = options.name ?? TEST_STRING_MARKUP_INTEGRATION_NAME;

	class TestStringRenderer extends StringMarkupRenderer {
		name = integrationName;
	}

	return defineIntegration({
		name: integrationName,
		extensions: options.extensions ?? [...TEST_STRING_MARKUP_EXTENSIONS],
		renderer: TestStringRenderer,
	})();
}

/**
 * Builds the standard app configuration used by Integration tests.
 *
 * @remarks
 * A test-only string Integration is installed by default so `.string.ts`
 * templates have an explicit owner. Pass `integrations: []` when a test
 * intentionally needs an app configuration without an Integration. Fixture
 * apps that author plain `.ts` templates must pass
 * `createStringMarkupIntegration({ extensions: ['.ts'] })`.
 */
export async function createTestAppConfig(options: CreateTestAppConfigOptions = {}) {
	const {
		baseUrl = TEST_RUNTIME_ORIGIN,
		configure,
		description = 'Ecopages',
		distDir,
		integrations = [createStringMarkupIntegration()],
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

/**
 * Creates a test-only Integration that supplies deterministic foreign-child markup.
 *
 * @remarks
 * Use this fixture to exercise Integration ownership boundaries without loading a
 * framework runtime. It is not a production renderer.
 */
export function createDeferredIntegrationPlugin(
	options: CreateDeferredIntegrationPluginOptions = {},
): AnyIntegrationPlugin {
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
