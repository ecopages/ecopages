import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { KitaRenderer } from '../kitajs-renderer.ts';

const Config = await new ConfigBuilder()
	.setIncludesTemplates({
		head: 'head.kita.tsx',
		html: 'html.kita.tsx',
		seo: 'seo.kita.tsx',
	})
	.setError404Template('404.kita.tsx')
	.setRobotsTxt({
		preferences: {
			'*': [],
		},
	})
	.setIntegrations([])
	.setDefaultMetadata({
		title: 'Ecopages',
		description: 'Ecopages',
	})
	.setBaseUrl('http://localhost:3000')
	.build();

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => {
	return `<html><body>${children}</body></html>`;
};

const renderer = new KitaRenderer({
	appConfig: Config,
	assetProcessingService: {} as any,
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

const createRendererWithAssets = () => {
	const assetProcessingService = {
		processDependencies: vi.fn(async () => [
			{
				kind: 'script',
				srcUrl: '/assets/kita-island.js',
				position: 'head',
			},
		]),
	};

	return {
		renderer: new KitaRenderer({
			appConfig: Config,
			assetProcessingService: assetProcessingService as any,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		}),
		assetProcessingService,
	};
};

describe('KitaRenderer', () => {
	it('should render a single component with renderComponent', async () => {
		const Component = (async (props: { title: string }) => `<h2>${props.title}</h2>`) as unknown as EcoComponent<{
			title: string;
		}>;

		const result = await renderer.renderComponent({
			component: Component,
			props: { title: 'Kita Component' },
		});

		expect(result.integrationName).toBe('kitajs');
		expect(result.canAttachAttributes).toBe(true);
		expect(result.rootTag).toBe('h2');
		expect(result.html).toContain('<h2>Kita Component</h2>');
	});

	it('should include component assets when dependencies are declared', async () => {
		const { renderer, assetProcessingService } = createRendererWithAssets();
		const Component = (async (props: { title: string }) => `<h2>${props.title}</h2>`) as unknown as EcoComponent<{
			title: string;
		}>;
		Component.config = {
			__eco: {
				id: 'kita-comp',
				file: '/project/src/components/kita-comp.kita.tsx',
				integration: 'kitajs',
			},
			dependencies: {
				scripts: ['./kita-comp.script.ts'],
			},
		};

		const result = await renderer.renderComponent({
			component: Component,
			props: { title: 'Kita Assets' },
		});

		expect(assetProcessingService.processDependencies).toHaveBeenCalled();
		expect(result.assets).toBeDefined();
		expect(result.assets?.[0]?.srcUrl).toBe('/assets/kita-island.js');
	});

	it('should render the page', async () => {
		renderer
			.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => 'Hello World',
				HtmlTemplate,
			})
			.then((body) => {
				expect(body).toBe('<!DOCTYPE html><html><body>Hello World</body></html>');
			});
	});

	it('should throw an error if the page fails to render', async () => {
		renderer
			.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
				metadata: {
					title: 'Hello World',
					description: 'Hello World',
				},
				Page: async () => {
					throw new Error('Page failed to render');
				},
				HtmlTemplate,
			})
			.catch((error) => {
				expect(error.message).toBe('Error rendering page: Page failed to render');
			});
	});
});
