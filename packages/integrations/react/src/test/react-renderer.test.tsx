import { afterAll, describe, expect, it, spyOn } from 'bun:test';
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';
import { fileSystem } from '@ecopages/file-system';
import React, { type JSX } from 'react';
import { ReactRenderer } from '../react-renderer';
import { ErrorPage } from './fixture/error-page';
import { Page } from './fixture/test-page';

const testDir = path.join(__dirname, 'fixture/.eco');

const mockConfig = await new ConfigBuilder()
	.setDistDir(testDir)
	.setIncludesTemplates({
		head: 'head.tsx',
		html: 'html.tsx',
		seo: 'seo.tsx',
	})
	.setError404Template('404.tsx')
	.setRobotsTxt({
		preferences: {
			'*': [],
			Googlebot: ['/public/'],
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
	appConfig: mockConfig,
	assetProcessingService: {} as any,
	runtimeOrigin: 'http://localhost:3000',
	resolvedIntegrationDependencies: [],
});

const createRenderer = () => {
	const testRenderer = new ReactRenderer({
		appConfig: mockConfig,
		assetProcessingService: {} as any,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
	spyOn(testRenderer as any, 'getHtmlTemplate').mockResolvedValue(HtmlTemplate);
	return testRenderer;
};

describe('ReactRenderer', () => {
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
		expect(
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
