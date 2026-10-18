import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { IntegrationRendererRenderOptions } from '@ecopages/core/integration';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import type { AssetProcessingService } from '@ecopages/core/integration';
import type { ReactNode } from 'react';
import { composeLayoutPageTree, assertComposablePage } from '../render/layout-compose.ts';
import { ReactRenderer } from '../render/react-renderer.ts';

class TestReactRenderer extends ReactRenderer {
	protected override async getHtmlTemplate() {
		return (({ children }: HtmlTemplateProps) =>
			children) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'];
	}

	protected override async resolveDependencies() {
		return [];
	}

	getRuntime() {
		return this.resolveReactRuntimeModules();
	}
}

function extractLayoutMarkerOrder(html: string): string[] {
	const matches = [...html.matchAll(/data-layout="([^"]+)"/g)];
	return matches.map((match) => match[1] ?? '');
}

const integrationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appConfig = await finalizeEcoPagesConfig({
	rootDir: integrationRoot,
	defaultMetadata: { title: 'Test', description: 'Test' },
});

describe('React SSR and hydration layout parity', () => {
	const assetService = {
		processDependencies: vi.fn(() => Promise.resolve([])),
		getHmrManager: vi.fn(() => undefined),
	} as unknown as AssetProcessingService;

	it('should match nested layout tier order between SSR and composeLayoutPageTree', async () => {
		const renderer = new TestReactRenderer({
			appConfig,
			assetProcessingService: assetService,
		});
		const { react, reactDomServer } = renderer.getRuntime();

		const Outer = ({ children }: { children?: ReactNode }) => <div data-layout="outer">{children}</div>;
		const Inner = ({ children }: { children?: ReactNode }) => <div data-layout="inner">{children}</div>;
		const Page = () => <div data-layout="page">content</div>;
		Page.config = {
			layouts: [Outer, Inner],
			layout: Inner,
			layoutEntries: [{ component: Outer }, { component: Inner }],
		};

		const clientTree = composeLayoutPageTree(assertComposablePage(Page), {}, { react });
		const clientHtml = reactDomServer.renderToString(clientTree);

		const serverHtml = String(
			await renderer.render({
				file: '/tmp/pages/nested.tsx',
				params: {},
				query: {},
				props: {},
				locals: undefined,
				pageLocals: undefined,
				metadata: appConfig.defaultMetadata,
				Page: Page as IntegrationRendererRenderOptions<ReactNode>['Page'],
				HtmlTemplate: (({ children }: HtmlTemplateProps) =>
					children) as IntegrationRendererRenderOptions<ReactNode>['HtmlTemplate'],
				resolvedDependencies: [],
				pageProps: {},
			}),
		);

		expect(extractLayoutMarkerOrder(serverHtml)).toEqual(['outer', 'inner', 'page']);
		expect(extractLayoutMarkerOrder(clientHtml)).toEqual(extractLayoutMarkerOrder(serverHtml));
	});
});
