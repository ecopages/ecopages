import { afterAll, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';
import { fileSystem } from '@ecopages/file-system';
import React, { type JSX } from 'react';
import { ReactRenderer } from '../react-renderer';
import { ErrorPage } from './fixture/error-page';
import { Page } from './fixture/test-page';

const mockRouterAdapter = {
	name: 'test-router',
	bundle: {
		importPath: '@test/router/browser',
		outputName: 'test-router',
		externals: ['react', 'react-dom'],
	},
	importMapKey: '@test/router',
	components: {
		router: 'TestRouter',
		pageContent: 'TestPageContent',
	},
	getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
};

const testDir = path.join(__dirname, 'fixture/.eco');

const Config = await new ConfigBuilder()
	.setDistDir(testDir)
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

const HtmlTemplate: EcoComponent<HtmlTemplateProps, JSX.Element> = ({ headContent, children }) => (
	<html lang="en">
		<head>{headContent}</head>
		<body>{children}</body>
	</html>
);

const pageFilePath = path.resolve(__dirname, 'fixture/test-page.tsx');
const errorPageFile = path.resolve(__dirname, 'fixture/error-page.tsx');

const renderer = new ReactRenderer({
	appConfig: Config,
	assetProcessingService: {} as any,
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

const createRenderer = () => {
	const testRenderer = new ReactRenderer({
		appConfig: Config,
		assetProcessingService: {} as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
	vi.spyOn(testRenderer as any, 'getHtmlTemplate').mockResolvedValue(HtmlTemplate);
	return testRenderer;
};

const createRendererWithAssets = () => {
	const assetProcessingService = {
		getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
		processDependencies: vi.fn(async () => []),
	};

	const testRenderer = new ReactRenderer({
		appConfig: Config,
		assetProcessingService: assetProcessingService as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
	vi.spyOn(testRenderer as any, 'getHtmlTemplate').mockResolvedValue(HtmlTemplate);
	return { testRenderer, assetProcessingService };
};

describe('ReactRenderer', () => {
	describe('renderComponent', () => {
		it('should render a single React component with structured output', async () => {
			const testRenderer = createRenderer();
			const Component = ((props: { title: string }) => <h2>{props.title}</h2>) as unknown as EcoComponent<{
				title: string;
			}>;

			const result = await testRenderer.renderComponent({
				component: Component,
				props: { title: 'React Component' },
			});

			expect(result.integrationName).toBe('react');
			expect(result.canAttachAttributes).toBe(true);
			expect(result.rootTag).toBe('h2');
			expect(result.html).toContain('<h2>React Component</h2>');
		});

		it('should report non-attachable boundaries for fragment output', async () => {
			const testRenderer = createRenderer();
			const Component = (() => (
				<>
					<span>One</span>
					<span>Two</span>
				</>
			)) as unknown as EcoComponent<object>;

			const result = await testRenderer.renderComponent({
				component: Component,
				props: {},
			});

			expect(result.canAttachAttributes).toBe(false);
			expect(result.rootTag).toBe('span');
			expect(result.html).toContain('<span>One</span>');
		});

		it('should emit hydration assets for attachable component roots', async () => {
			const { testRenderer, assetProcessingService } = createRendererWithAssets();
			const Component = ((props: { title: string }) => <h3>{props.title}</h3>) as unknown as EcoComponent<{
				title: string;
			}>;
			Component.config = {
				__eco: {
					id: 'component-id',
					file: pageFilePath,
					integration: 'react',
				},
			};

			const result = await testRenderer.renderComponent({
				component: Component,
				props: { title: 'Island' },
				integrationContext: { componentInstanceId: 'island-1' },
			});

			expect(result.canAttachAttributes).toBe(true);
			expect(result.rootAttributes).toEqual({ 'data-eco-component-id': 'island-1' });
			expect(assetProcessingService.processDependencies).toHaveBeenCalled();
		});

		it('should not emit island assets when no componentInstanceId is provided', async () => {
			const originalRouterAdapter = ReactRenderer.routerAdapter;
			ReactRenderer.routerAdapter = mockRouterAdapter;

			try {
				const { testRenderer, assetProcessingService } = createRendererWithAssets();
				const Component = ((props: { title: string }) => <h3>{props.title}</h3>) as unknown as EcoComponent<{
					title: string;
				}>;
				Component.config = {
					__eco: {
						id: 'component-id',
						file: pageFilePath,
						integration: 'react',
					},
				};

				const result = await testRenderer.renderComponent({
					component: Component,
					props: { title: 'Page child' },
				});

				expect(result.canAttachAttributes).toBe(true);
				expect(result.rootAttributes).toBeUndefined();
				expect(result.assets).toBeUndefined();
				expect(assetProcessingService.processDependencies).not.toHaveBeenCalled();
			} finally {
				ReactRenderer.routerAdapter = originalRouterAdapter;
			}
		});
	});

	afterAll(() => {
		if (fileSystem.exists(testDir)) {
			fileSystem.remove(testDir);
		}
	});

	it('should render the page', async () => {
		const body = await renderer.render({
			params: {},
			query: {},
			props: {},
			resolvedDependencies: [],
			file: pageFilePath,
			metadata: {
				title: 'Test Page',
				description: 'Test Description',
			},
			dependencies: {
				scripts: [],
				stylesheets: [],
			},
			Page,
			HtmlTemplate,
		});

		const text = await new Response(body as BodyInit).text();
		expect(text).toContain('<div>Hello World</div>');
	});

	it('should throw an error if the page fails to render', async () => {
		await expect(
			renderer.render({
				params: {},
				query: {},
				props: {},
				file: errorPageFile,
				resolvedDependencies: [],
				metadata: {
					title: 'Error Page',
					description: 'Error Description',
				},
				dependencies: {
					scripts: [],
					stylesheets: [],
				},
				Page: ErrorPage,
				HtmlTemplate,
			}),
		).rejects.toThrow('Failed to render component');
	});

	describe('renderToResponse', () => {
		it('should render a view with default status 200', async () => {
			const testRenderer = createRenderer();
			const MockView = ((props: { title: string }) => <h1>{props.title}</h1>) as unknown as EcoComponent<{
				title: string;
			}>;

			const response = await testRenderer.renderToResponse(MockView, { title: 'Hello React' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
			const body = await response.text();
			expect(body).toContain('<h1>Hello React</h1>');
		});

		it('should render a partial view without full HTML wrapper', async () => {
			const testRenderer = createRenderer();
			const MockView = ((props: { content: string }) => <div>{props.content}</div>) as unknown as EcoComponent<{
				content: string;
			}>;

			const response = await testRenderer.renderToResponse(MockView, { content: 'Partial' }, { partial: true });

			const body = await response.text();
			expect(body).toContain('<div>Partial</div>');
		});

		it('should apply custom status code', async () => {
			const testRenderer = createRenderer();
			const MockView = (() => <p>Not Found</p>) as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(MockView, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const testRenderer = createRenderer();
			const MockView = (() => <p>Cached</p>) as unknown as EcoComponent<object>;

			const response = await testRenderer.renderToResponse(
				MockView,
				{},
				{
					headers: {
						'Cache-Control': 'max-age=3600',
						'X-Custom-Header': 'test-value',
					},
				},
			);

			expect(response.headers.get('Cache-Control')).toBe('max-age=3600');
			expect(response.headers.get('X-Custom-Header')).toBe('test-value');
		});

		it('should render with layout when not partial', async () => {
			const testRenderer = createRenderer();
			const MockLayout = (({ children }: { children: JSX.Element }) => (
				<main className="layout">{children}</main>
			)) as unknown as EcoComponent<{ children: JSX.Element }>;

			const MockView = ((props: { message: string }) => <p>{props.message}</p>) as unknown as EcoComponent<{
				message: string;
			}>;
			MockView.config = { layout: MockLayout };

			const response = await testRenderer.renderToResponse(MockView, { message: 'With Layout' }, {});

			const body = await response.text();
			expect(body).toContain('layout');
			expect(body).toContain('<p>With Layout</p>');
		});

		it('should throw an error if the view fails to render', async () => {
			const testRenderer = createRenderer();
			const MockView = (() => {
				throw new Error('View failed to render');
			}) as unknown as EcoComponent<object>;

			await expect(testRenderer.renderToResponse(MockView, {}, {})).rejects.toThrow('Failed to render view');
		});
	});
});
