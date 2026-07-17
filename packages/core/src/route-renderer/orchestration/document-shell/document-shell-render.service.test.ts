import { describe, expect, it, vi } from 'vitest';
import type { EcoComponent } from '../../../types/public-types.ts';
import { eco } from '../../../eco/eco.ts';
import {
	composeDocumentShell,
	composeSequentialLayoutChildren,
	applyDocumentShellAttributeStamping,
	type DocumentShellComposeChildrenContext,
} from './document-shell-render.service.ts';

function stubComponent(id: string): EcoComponent {
	const component = (() => '') as EcoComponent;
	component.config = { __eco: { id, file: `/app/${id}.tsx`, integration: 'test' } };
	return component;
}

describe('document-shell-render.service', () => {
	it('should compose page, layout, and document shells with shared renderer cache', async () => {
		const rendererCaches: Array<Map<string, unknown> | undefined> = [];
		const renderComponentWithForeignChildren = vi.fn(
			async (input: {
				component: EcoComponent;
				children?: unknown;
				integrationContext?: { rendererCache?: Map<string, unknown> };
			}) => {
				rendererCaches.push(input.integrationContext?.rendererCache);
				const id = input.component.config?.__eco?.id ?? 'unknown';
				return {
					html: input.children ? `<${id}>${String(input.children)}</${id}>` : `<${id} />`,
					assets: [],
					canAttachAttributes: true,
					rootTag: id,
					integrationName: 'test',
				};
			},
		);

		const Page = eco.page({
			__eco: { id: 'page', file: '/app/pages/index.kita.tsx', integration: 'kitajs' },
			render: () => '<page />',
		});
		const Layout = eco.layout({
			__eco: { id: 'layout', file: '/app/layouts/root.kita.tsx', integration: 'kitajs' },
			render: ({ children }) => `<layout>${children}</layout>`,
		});
		const HtmlTemplate = eco.html({
			__eco: { id: 'html', file: '/app/html.kita.tsx', integration: 'kitajs' },
			render: ({ children }) => `<html>${children}</html>`,
		});

		const { documentHtml } = await composeDocumentShell(
			{
				renderComponentWithForeignChildren,
				appendProcessedDependencies: () => [],
			},
			{
				primaryComponent: Page,
				primaryProps: { title: 'Hello' },
				layout: { component: Layout, props: { section: 'docs' } },
				htmlTemplate: HtmlTemplate,
				documentProps: { metadata: { title: 'Hello', description: 'Hello' }, pageProps: {} },
			},
		);

		expect(documentHtml).toBe('<html><layout><page /></layout></html>');
		expect(renderComponentWithForeignChildren).toHaveBeenCalledTimes(3);
		expect(rendererCaches.every((cache) => cache === rendererCaches[0])).toBe(true);
	});

	it('should nest multiple layouts outer to inner by default', async () => {
		const renderComponentWithForeignChildren = vi.fn(
			async (input: { component: EcoComponent; children?: unknown }) => {
				const id = input.component.config?.__eco?.id ?? 'node';
				return {
					html: `<${id}>${input.children ?? ''}</${id}>`,
					assets: [],
					canAttachAttributes: true,
					rootTag: 'div',
					integrationName: 'test',
				};
			},
		);
		const Outer = stubComponent('outer');
		const Inner = stubComponent('inner');
		const Page = stubComponent('page');
		const HtmlTemplate = stubComponent('html');

		const { documentHtml } = await composeDocumentShell(
			{
				renderComponentWithForeignChildren,
				appendProcessedDependencies: () => [],
			},
			{
				primaryComponent: Page,
				primaryProps: {},
				layouts: [{ component: Outer }, { component: Inner }],
				htmlTemplate: HtmlTemplate,
				documentProps: {},
			},
		);

		expect(documentHtml).toBe('<html><outer><inner><page></page></inner></outer></html>');
	});

	it('should delegate child composition to composeChildren hook', async () => {
		const composeChildren = vi.fn(async (context: DocumentShellComposeChildrenContext) => {
			expect(context.layouts).toHaveLength(1);
			expect(context.primaryComponent).toBeDefined();
			return {
				children: '<hooked />',
				layoutRenders: [],
				primaryRender: {
					html: '<hooked />',
					assets: [],
					canAttachAttributes: true,
					rootTag: 'main',
					integrationName: 'test',
				},
			};
		});
		const renderComponentWithForeignChildren = vi.fn(async () => ({
			html: '<page />',
			assets: [],
			canAttachAttributes: true,
			rootTag: 'main',
			integrationName: 'test',
		}));

		await composeDocumentShell(
			{
				renderComponentWithForeignChildren,
				appendProcessedDependencies: () => [],
			},
			{
				primaryComponent: stubComponent('page'),
				primaryProps: {},
				layout: { component: stubComponent('layout') },
				composeChildren,
				htmlTemplate: stubComponent('html'),
				documentProps: {},
			},
		);

		expect(composeChildren).toHaveBeenCalledOnce();
		expect(renderComponentWithForeignChildren).toHaveBeenCalledOnce();
		expect(renderComponentWithForeignChildren).toHaveBeenCalledWith(
			expect.objectContaining({
				children: '<hooked />',
			}),
		);
	});

	it('should export composeSequentialLayoutChildren as the default hook implementation', async () => {
		const rendererCache = new Map<string, unknown>();
		const primaryRender = {
			html: '<page />',
			assets: [],
			canAttachAttributes: true,
			rootTag: 'main',
			integrationName: 'test',
		};
		const layoutRender = {
			html: '<layout><page /></layout>',
			assets: [],
			canAttachAttributes: true,
			rootTag: 'div',
			integrationName: 'test',
		};
		const renderComponentWithForeignChildren = vi.fn(async () => layoutRender);
		const Layout = stubComponent('layout');

		const result = await composeSequentialLayoutChildren({
			primaryRender,
			primaryComponent: stubComponent('page'),
			primaryProps: {},
			layouts: [{ component: Layout, props: { section: 'docs' } }],
			rendererCache,
			renderComponentWithForeignChildren,
		});

		expect(result).toEqual({
			children: '<layout><page /></layout>',
			layoutRenders: [layoutRender],
		});
		expect(renderComponentWithForeignChildren).toHaveBeenCalledWith({
			component: Layout,
			props: { section: 'docs' },
			children: '<page />',
			integrationContext: { rendererCache },
		});
	});

	it('stamps component-root and document attributes through applyDocumentShellAttributeStamping', () => {
		const stamped = applyDocumentShellAttributeStamping(
			'<html><body><main>Page</main></body></html>',
			{
				applyAttributesToFirstBodyElement: (html, attributes) =>
					html.replace(
						'<main',
						`<main ${Object.entries(attributes)
							.map(([key, value]) => `${key}="${value}"`)
							.join(' ')}`,
					),
				applyAttributesToHtmlElement: (html, attributes) =>
					html.replace(
						'<html',
						`<html ${Object.entries(attributes)
							.map(([key, value]) => `${key}="${value}"`)
							.join(' ')}`,
					),
			},
			{
				componentRootAttributes: { 'data-eco-component-id': 'eco-page-root' },
				documentAttributes: { 'data-eco-document-owner': 'react-router' },
			},
		);

		expect(stamped).toContain('<html data-eco-document-owner="react-router"><body>');
		expect(stamped).toContain('<main data-eco-component-id="eco-page-root">Page</main>');
	});
});
