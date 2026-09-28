import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { EcoPageComponent } from '../../../eco/eco.types.ts';
import type { EcoComponent, HtmlTemplateProps } from '../../../types/public-types.ts';
import { TestIntegrationRenderer, testAppConfig, testAssetService } from '../integration-renderer.test-fixtures.ts';

describe('document shell finalization', () => {
	it('should expose island bootstrap dependencies from renderer modules', () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...testAppConfig,
				runtime: {
					rendererModuleContext: {
						islandClientModuleId: 'virtual:ecopages/island-client.ts',
					},
				},
			} as EcoPagesAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		expect(renderer.testGetRendererBootstrapDependencies()).toEqual([
			{
				attributes: {
					crossorigin: 'anonymous',
					'data-ecopages-runtime': 'islands',
					type: 'module',
				},
				content: 'import "virtual:ecopages/island-client.ts";',
				inline: true,
				kind: 'script',
				packageRole: 'keep-separate',
				position: 'body',
			},
		]);
		expect(renderer.testGetRendererBootstrapDependencies(true)).toEqual([]);
	});

	it('should inject the island client bootstrap into finalized full-document HTML', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...testAppConfig,
				runtime: {
					rendererModuleContext: {
						islandClientModuleId: 'virtual:ecopages/island-client.ts',
					},
				},
			} as EcoPagesAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const html = await renderer.testFinalizeDocumentShellHtml({
			html: '<!DOCTYPE html><html><body><main>hello</main></body></html>',
		});

		expect(html).toContain('data-ecopages-runtime="islands"');
		expect(html).toContain('import "virtual:ecopages/island-client.ts";');
	});

	it('should inject declarative html contributions during final html transformation', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});
		renderer.HtmlContributions = [
			{ placement: 'head-prepend', html: '<meta name="integration-slot" content="head">' },
			{ placement: 'body-append', html: '<script id="integration-tail">window.tail = true;</script>' },
		];

		const html = await renderer.testFinalizeDocumentShellHtml({
			html: '<!DOCTYPE html><html><head><title>Page</title></head><body><main>hello</main></body></html>',
		});

		expect(html).toContain('<head><meta name="integration-slot" content="head"><title>Page</title>');
		expect(html).toContain('<script id="integration-tail">window.tail = true;</script></body>');
	});

	it('should inject declarative html contributions during shared route execution', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});
		renderer.PageModule = {
			default: (() => 'Hello Route') as EcoPageComponent<any>,
		};
		renderer.HtmlTemplate = (() =>
			'<html><head><title>Route</title></head><body><main>Hello Route</main></body></html>') as EcoComponent<HtmlTemplateProps>;
		renderer.RenderedBody = '<html><head><title>Route</title></head><body><main>Hello Route</main></body></html>';
		renderer.HtmlContributions = [
			{ placement: 'head-prepend', html: '<meta name="route-slot" content="head">' },
			{ placement: 'body-append', html: '<script id="route-tail">window.routeTail = true;</script>' },
		];

		const result = await renderer.execute({
			file: '/app/pages/route.tsx',
			params: {},
			query: {},
		});
		const html = await new Response(result.body as BodyInit).text();

		expect(html).toContain('<head><meta name="route-slot" content="head"><title>Route</title>');
		expect(html).toContain('<script id="route-tail">window.routeTail = true;</script></body>');
	});
});
