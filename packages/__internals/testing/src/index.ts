import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoFunctionComponent,
	EcoPagesAppConfig,
	EcoPagesElement,
} from '@ecopages/core';
import { type EcoPagesUserConfig } from '@ecopages/core/config';
import { finalizeEcoPagesConfig } from '@ecopages/core/internal/finalize-config';
import { defineIntegration } from '@ecopages/core/plugins/define-integration';
import { IntegrationPlugin, type AnyIntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import { IntegrationRenderer } from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { StringMarkupRenderer } from '@ecopages/core/route-renderer/orchestration/string-markup-renderer';

export const TEST_RUNTIME_ORIGIN = 'http://localhost:3000';

export type CreateTestAppConfigOptions = {
	baseUrl?: string;
	/** Adjusts the user config before finalization (same shape as `eco.config.ts`). */
	configure?: (config: EcoPagesUserConfig) => EcoPagesUserConfig | void;
	description?: string;
	distDir?: string;
	integrations?: AnyIntegrationPlugin[];
	rootDir?: string;
	runtimeOrigin?: string;
	title?: string;
	workDir?: string;
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
 * templates have an explicit owner. Pass `integrations: []` when a test needs
 * no Integration of its own; core still appends its HTML Pages Integration. Fixture
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
		rootDir = '.',
		runtimeOrigin = baseUrl,
		title = 'Ecopages',
		workDir,
	} = options;

	let userConfig: EcoPagesUserConfig = {
		rootDir,
		baseUrl,
		distDir,
		workDir,
		integrations,
		defaultMetadata: {
			title,
			description,
		},
		robotsTxt: {
			preferences: {
				'*': [],
			},
		},
	};

	const configured = configure?.(userConfig);
	if (configured) {
		userConfig = configured;
	}

	const config = await finalizeEcoPagesConfig(userConfig);

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

/**
 * The `<head>` of a rendered document, or an empty string when the shell has none.
 */
export function htmlDocumentHead(html: string): string {
	return html.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)?.[0] ?? '';
}

async function renderResultText(body: unknown): Promise<string> {
	if (typeof body === 'string') {
		return body;
	}

	if (body instanceof ReadableStream) {
		return await new Response(body).text();
	}

	if (body instanceof Uint8Array) {
		return new TextDecoder().decode(body);
	}

	return String(body);
}

/**
 * Renders one view as a filesystem page and as an explicit view.
 *
 * @remarks
 * The two documents are expected to match. A test fails when the explicit
 * view drops a layout or a head field the filesystem page still has.
 */
export async function renderFilesystemPageAndExplicitView(
	renderer: IntegrationRenderer<unknown>,
	view: EcoComponent,
	props: Record<string, unknown>,
	file: string,
): Promise<{ pageHtml: string; explicitHtml: string }> {
	const pageView = view as EcoFunctionComponent<Record<string, unknown>, unknown>;
	const page = await renderer.execute({
		file,
		pageModule: { default: pageView },
		params: {},
		query: {},
		props,
	});
	const explicit = await renderer.renderExplicitView(pageView, props, { file });

	return {
		pageHtml: await renderResultText(page.body),
		explicitHtml: await explicit.text(),
	};
}
