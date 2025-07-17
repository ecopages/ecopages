import { afterAll, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { ConfigBuilder, type EcoComponent, FileUtils, type HtmlTemplateProps } from '@ecopages/core';
import type { JSX } from 'react';
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

describe('ReactRenderer', () => {
	afterAll(() => {
		if (FileUtils.existsSync(testDir)) {
			FileUtils.rmdirSync(testDir, { recursive: true });
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
});
