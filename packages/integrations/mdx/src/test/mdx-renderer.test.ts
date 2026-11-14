import { describe, expect, it, vi } from 'vitest';
import type { EcoComponent, EcoPageFile, EcoPagesElement, HtmlTemplateProps } from '@ecopages/core';
import type { ProcessedAsset } from '@ecopages/core/integration';
import { createTestAppConfig } from '@ecopages/testing';
import { createStringMarkupContractFactories, describeRendererContract } from '@ecopages/testing/renderer-contract';
import { AssetProcessingService } from '@ecopages/core/integration';
import type { PageBrowserGraphContributionContext } from '@ecopages/core/integration';
import { MDXRenderer } from '../mdx-renderer.ts';

const Config = await createTestAppConfig();

function createTestAssetProcessingService(appConfig: typeof Config): AssetProcessingService {
	const service = new AssetProcessingService(appConfig);
	vi.spyOn(service, 'processDependencies').mockResolvedValue([]);
	return service;
}

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => {
	return `<html><body>${children}</body></html>`;
};

class TestMdxRenderer extends MDXRenderer {
	htmlTemplate: EcoComponent<HtmlTemplateProps> = HtmlTemplate;

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return this.htmlTemplate;
	}
}

const renderer = new MDXRenderer({
	appConfig: Config,
	assetProcessingService: createTestAssetProcessingService(Config),
	resolvedIntegrationDependencies: [],
});

describeRendererContract({
	name: 'MDX',
	errorPrefix: 'Error rendering page',
	viewFile: '/app/pages/contract.mdx',
	...createStringMarkupContractFactories('MDX'),
	async createRenderer({ integrations, processDependencies }) {
		const testRenderer = new TestMdxRenderer({
			appConfig: await createTestAppConfig({ integrations }),
			assetProcessingService: { processDependencies } as never,
			resolvedIntegrationDependencies: [],
		});
		testRenderer.htmlTemplate = (async ({ children, metadata }) =>
			`<html><head><title>${metadata.title}</title></head><body>${children}</body></html>`) as EcoComponent<HtmlTemplateProps>;
		return testRenderer;
	},
});

class ImportTestMdxRenderer extends MDXRenderer {
	public normalizeForTest(module: EcoPageFile) {
		return this.normalizeImportedPageFile('/tmp/page.mdx', module as never);
	}
}

class BrowserGraphTestMdxRenderer extends MDXRenderer {
	public resolvedComponents: Array<EcoComponent | Partial<EcoComponent>> = [];
	public resolvedAssets: ProcessedAsset[] = [];

	public collectForTest(context: PageBrowserGraphContributionContext) {
		return this.collectPageBrowserGraphContribution(context);
	}

	protected override async processComponentDependencies(
		components: Array<EcoComponent | Partial<EcoComponent>>,
	): Promise<ProcessedAsset[]> {
		this.resolvedComponents = components;
		return this.resolvedAssets;
	}
}

describe('MDXRenderer', () => {
	describe('page importing', () => {
		it('normalizes imported MDX modules without overriding the base import path', () => {
			const testRenderer = new ImportTestMdxRenderer({
				appConfig: Config,
				assetProcessingService: createTestAssetProcessingService(Config),
				resolvedIntegrationDependencies: [],
			});
			const Layout = (async ({ children }: { children: EcoPagesElement }) => children) as EcoComponent<{
				children: EcoPagesElement;
			}>;
			const Page = (async () => '<article>content</article>') as unknown as EcoComponent;
			const config = { layouts: [Layout] } as never;

			const result = testRenderer.normalizeForTest({
				default: Page,
				config,
				getMetadata: async () => ({
					title: 'Hello',
					description: 'Hello',
				}),
			} as never) as EcoPageFile;

			expect(result.default).toBe(Page);
			expect(result).not.toHaveProperty('layout');
			expect((result.default as typeof Page).config).toBe(config);
		});
	});

	describe('layout stack', () => {
		it('renders every layout of a config.layout array, outer around inner', async () => {
			const testRenderer = new TestMdxRenderer({
				appConfig: Config,
				assetProcessingService: createTestAssetProcessingService(Config),
				resolvedIntegrationDependencies: [],
			});
			const Outer = (async ({ children }: { children: EcoPagesElement }) =>
				`<div data-layout="outer">${children}</div>`) as unknown as EcoComponent<{ children: EcoPagesElement }>;
			const Inner = (async ({ children }: { children: EcoPagesElement }) =>
				`<div data-layout="inner">${children}</div>`) as unknown as EcoComponent<{ children: EcoPagesElement }>;
			const Page = (async () => '<article>content</article>') as unknown as EcoComponent;
			const normalized = new ImportTestMdxRenderer({
				appConfig: Config,
				assetProcessingService: createTestAssetProcessingService(Config),
				resolvedIntegrationDependencies: [],
			}).normalizeForTest({
				default: Page,
				config: { layout: [Outer, Inner] },
				getMetadata: async () => ({ title: 'Hello', description: 'Hello' }),
			} as never);

			const result = await testRenderer.execute({
				file: '/app/pages/post.mdx',
				pageModule: normalized,
				params: {},
				query: {},
			} as never);

			const html = await new Response(result.body as BodyInit).text();
			expect(html).toContain(
				'<div data-layout="outer"><div data-layout="inner"><article>content</article></div></div>',
			);
		});
	});

	describe('page browser graph contribution', () => {
		it('preserves page and imported MDX layout identities in dependency collection', async () => {
			const renderer = new BrowserGraphTestMdxRenderer({
				appConfig: Config,
				assetProcessingService: createTestAssetProcessingService(Config),
				resolvedIntegrationDependencies: [],
			});
			const Layout = (async ({ children }: { children: EcoPagesElement }) => children) as EcoComponent<{
				children: EcoPagesElement;
			}>;
			const layoutAsset = { kind: 'script', inline: false, srcUrl: '/assets/mdx-layout.js' } as ProcessedAsset;
			renderer.resolvedAssets = [layoutAsset];
			Layout.config = {
				identity: { id: 'imported-mdx-layout', file: '/app/layouts/site.mdx', integration: 'mdx' },
				dependencies: { scripts: ['./site.client.js'] },
			};
			const Page = (async () => '<article>content</article>') as unknown as EcoComponent;
			const pageConfig = {
				identity: { id: 'existing-page-identity', file: '/app/pages/original.mdx', integration: 'mdx' },
				dependencies: { scripts: ['./page.client.js'] },
				layouts: [Layout],
			};
			Page.config = pageConfig;

			const contribution = await renderer.collectForTest({
				file: '/app/pages/post.mdx',
				pageModule: { default: Page, config: pageConfig } as EcoPageFile,
			});

			expect(renderer.resolvedComponents.map((component) => component.config?.identity)).toEqual([
				{ id: 'imported-mdx-layout', file: '/app/layouts/site.mdx', integration: 'mdx' },
				{ id: 'existing-page-identity', file: '/app/pages/post.mdx', integration: 'mdx' },
			]);
			expect(contribution?.assets).toEqual([layoutAsset]);
		});
	});

	describe('render', () => {
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
				Page: async () => '<article>MDX Content</article>',
				HtmlTemplate,
			});

			expect(body).toContain('<!DOCTYPE html>');
			expect(body).toContain('<article>MDX Content</article>');
		});
	});
});
