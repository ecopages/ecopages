import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { jsx as kitajsx, jsxs as kitajsxs } from '@kitajs/html/jsx-runtime';
import {
	eco,
	type ComponentRenderInput,
	type ComponentRenderResult,
	type EcoComponent,
	type EcoPagesElement,
	type HtmlTemplateProps,
} from '@ecopages/core';
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import { IntegrationRenderer } from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { createTestAppConfig } from '@ecopages/testing';
import { createStringMarkupContractFactories, describeRendererContract } from '@ecopages/testing/renderer-contract';
import { KitaRenderer } from '../kitajs-renderer.ts';

type MarkupNodeLike = {
	nodeType: number;
	outerHTML: string;
};

const Config = await createTestAppConfig();

function createTestAssetProcessingService(appConfig: typeof Config): AssetProcessingService {
	const service = new AssetProcessingService(appConfig);
	vi.spyOn(service, 'processDependencies').mockResolvedValue([]);
	return service;
}

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => {
	return `<html><body>${children}</body></html>`;
};
HtmlTemplate.config = {
	integration: 'kitajs',
	identity: { id: 'html', file: '/app/includes/html.kita.tsx', integration: 'kitajs' },
};

class EcopagesJsxForeignRenderer extends IntegrationRenderer<MarkupNodeLike> {
	name = 'ecopages-jsx';

	async render(): Promise<string> {
		return '';
	}

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const component = input.component as (props: Record<string, unknown>) => MarkupNodeLike;
		const rendered = component(input.props);

		return {
			html: rendered.outerHTML,
			canAttachAttributes: true,
			rootTag: 'strong',
			integrationName: this.name,
		};
	}
}

class EcopagesJsxForeignPlugin extends IntegrationPlugin<MarkupNodeLike> {
	renderer = EcopagesJsxForeignRenderer;

	constructor() {
		super({
			name: 'ecopages-jsx',
			extensions: ['.eco.tsx'],
		});
	}
}

class TestKitaRenderer extends KitaRenderer {
	PageModules = new Map<string, { default: EcoComponent<any> }>();
	htmlTemplate: EcoComponent<HtmlTemplateProps> = HtmlTemplate;

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return this.htmlTemplate;
	}

	protected override async resolveDependencies(): Promise<[]> {
		return [];
	}
}

/**
 * Creates a typed test component that satisfies EcoComponent without
 * requiring `as unknown as` double-casts.
 */
function createTestComponent<P>(fn: (props: P) => Promise<string> | string): EcoComponent<P> {
	return fn as EcoComponent<P>;
}

const renderer = new TestKitaRenderer({
	appConfig: Config,
	assetProcessingService: createTestAssetProcessingService(Config),
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

const headedTemplate = (async ({ children, metadata }) =>
	`<html><head><title>${metadata.title}</title></head><body>${children}</body></html>`) as EcoComponent<HtmlTemplateProps>;
headedTemplate.config = {
	integration: 'kitajs',
	identity: { id: 'html', file: '/app/includes/html.kita.tsx', integration: 'kitajs' },
};

describeRendererContract({
	name: 'kitajs',
	errorPrefix: 'Error rendering page',
	...createStringMarkupContractFactories('kitajs'),
	async createRenderer({ integrations, processDependencies }) {
		const testRenderer = new TestKitaRenderer({
			appConfig: await createTestAppConfig({ integrations }),
			assetProcessingService: { processDependencies } as never,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});
		testRenderer.htmlTemplate = headedTemplate;
		return testRenderer;
	},
});

describe('KitaRenderer', () => {
	it('should render the page', async () => {
		const body = await renderer.render({
			params: {},
			query: {},
			props: {},
			file: 'file',
			resolvedDependencies: [],
			metadata: {
				title: 'Hello World',
				description: 'Hello World',
			},
			Page: createTestComponent(async () => 'Hello World'),
			HtmlTemplate,
		});

		expect(body).toBe('<!DOCTYPE html><html><body>Hello World</body></html>');
	});

	it('renders an Ecopages JSX child through the real Kita JSX runtime', async () => {
		const jsxPlugin = new EcopagesJsxForeignPlugin();
		const kitaPlugin = new (class extends IntegrationPlugin<EcoPagesElement> {
			renderer = KitaRenderer;

			constructor() {
				super({
					name: 'kitajs',
					extensions: ['.kita.tsx'],
					jsxImportSource: '@kitajs/html',
				});
			}
		})();

		const config = await createTestAppConfig({
			integrations: [jsxPlugin, kitaPlugin],
		});

		const testRenderer = new TestKitaRenderer({
			appConfig: config,
			assetProcessingService: {
				processDependencies: vi.fn(async () => []),
			} as never,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});

		const EcopagesJsxLeaf = eco.component<{}, MarkupNodeLike>({
			identity: {
				id: 'kitajs-foreign-ecopages-jsx-leaf',
				file: '/app/components/kitajs-foreign-ecopages-jsx-leaf.eco.tsx',
				integration: 'ecopages-jsx',
			},
			integration: 'ecopages-jsx',
			render: () => ({
				nodeType: 1,
				outerHTML: '<strong data-ecopages-jsx-leaf="true">Leaf</strong>',
			}),
		});

		const KitaHost = eco.component<{}, EcoPagesElement>({
			identity: {
				id: 'kitajs-foreign-ecopages-jsx-host',
				file: '/app/components/kitajs-foreign-ecopages-jsx-host.kita.tsx',
				integration: 'kitajs',
			},
			integration: 'kitajs',
			dependencies: {
				components: [EcopagesJsxLeaf],
			},
			render: () =>
				kitajsxs('div', {
					'data-testid': 'kitajs-foreign-host',
					children: [kitajsx('span', { children: 'before' }), kitajsx(EcopagesJsxLeaf, {})],
				}) as unknown as EcoPagesElement,
		});

		const result = await testRenderer.renderComponentWithForeignChildren({
			component: KitaHost,
			props: {},
			integrationContext: {
				componentInstanceId: 'kitajs-foreign-ecopages-jsx-host',
			},
		});

		expect(result.html).toContain('data-testid="kitajs-foreign-host"');
		expect(result.html).toContain('<strong data-ecopages-jsx-leaf="true">Leaf</strong>');
	});
});
