import { describe, expect, it, vi } from 'vitest';
import type { EcoComponent } from '../../../types/contracts.ts';
import { eco } from '../../../eco/eco.ts';
import {
	composeDocumentShell,
	composeSequentialLayoutChildren,
	type DocumentShellComposeChildrenContext,
} from './document-shell-render.service.ts';
import { LayoutChildrenNotRenderedError } from './layout-children-not-rendered-error.ts';

function stubComponent(id: string): EcoComponent {
	const component = (() => '') as EcoComponent;
	component.config = { identity: { id, file: `/app/${id}.tsx`, integration: 'test' } };
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
				const id = input.component.config?.identity?.id ?? 'unknown';
				return {
					html: input.children ? `<${id}>${String(input.children)}</${id}>` : `<${id} />`,
					canAttachAttributes: true,
					integrationName: 'test',
				};
			},
		);

		const Page = eco.page({
			identity: { id: 'page', file: '/app/pages/index.kita.tsx', integration: 'kitajs' },
			render: () => '<page />',
		});
		const Layout = eco.layout({
			identity: { id: 'layout', file: '/app/layouts/root.kita.tsx', integration: 'kitajs' },
			render: ({ children }) => `<layout>${children}</layout>`,
		});
		const HtmlTemplate = eco.html({
			identity: { id: 'html', file: '/app/html.kita.tsx', integration: 'kitajs' },
			render: ({ children }) => `<html>${children}</html>`,
		});

		const { documentHtml } = await composeDocumentShell(
			{ renderComponentWithForeignChildren },
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
				const id = input.component.config?.identity?.id ?? 'node';
				return {
					html: `<${id}>${input.children ?? ''}</${id}>`,
					canAttachAttributes: true,
					integrationName: 'test',
				};
			},
		);
		const Outer = stubComponent('outer');
		const Inner = stubComponent('inner');
		const Page = stubComponent('page');
		const HtmlTemplate = stubComponent('html');

		const { documentHtml } = await composeDocumentShell(
			{ renderComponentWithForeignChildren },
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
		const Layout = stubComponent('layout');
		const Page = stubComponent('page');
		const composeChildren = vi.fn(async (_context: DocumentShellComposeChildrenContext) => {
			return { children: '<hooked />' };
		});
		const renderComponentWithForeignChildren = vi.fn(async () => ({
			html: '<page />',
			canAttachAttributes: true,
			integrationName: 'test',
		}));

		await composeDocumentShell(
			{ renderComponentWithForeignChildren },
			{
				primaryComponent: Page,
				primaryProps: {},
				layout: { component: Layout },
				composeChildren,
				htmlTemplate: stubComponent('html'),
				documentProps: {},
			},
		);

		expect(composeChildren).toHaveBeenCalledOnce();
		expect(composeChildren).toHaveBeenCalledWith(
			expect.objectContaining({
				primaryComponent: Page,
				layouts: [expect.objectContaining({ component: Layout })],
			}),
		);
		expect(renderComponentWithForeignChildren).toHaveBeenCalledOnce();
		expect(renderComponentWithForeignChildren).toHaveBeenCalledWith(
			expect.objectContaining({
				children: '<hooked />',
			}),
		);
	});

	it('wraps the primary HTML in layouts from innermost to outermost', async () => {
		const rendererCache = new Map<string, unknown>();
		const renderComponentWithForeignChildren = vi.fn(async (input: { children?: unknown }) => ({
			html: `<layout>${String(input.children)}</layout>`,
			canAttachAttributes: true,
			integrationName: 'test',
		}));
		const Layout = stubComponent('layout');

		const result = await composeSequentialLayoutChildren(
			{
				primaryComponent: stubComponent('page'),
				primaryProps: {},
				layouts: [{ component: Layout, props: { section: 'docs' } }],
				rendererCache,
				renderComponentWithForeignChildren,
			},
			'<page />',
		);

		expect(result).toEqual({ children: '<layout><page /></layout>' });
		expect(renderComponentWithForeignChildren).toHaveBeenCalledWith({
			component: Layout,
			props: { section: 'docs' },
			children: expect.stringContaining('<page />'),
			integrationContext: { rendererCache },
		});
	});

	describe('a layout that does not render its children', () => {
		const renderWithoutChildren = vi.fn(async (input: { component: EcoComponent; children?: unknown }) => ({
			html: input.component === Dropping ? '<aside />' : `<main>${String(input.children ?? '')}</main>`,
			canAttachAttributes: true,
			integrationName: 'test',
		}));
		const Dropping = stubComponent('dropping-layout');
		const Outer = stubComponent('outer-layout');

		function compose(layouts: EcoComponent[], primaryComponent = stubComponent('page')) {
			return composeSequentialLayoutChildren(
				{
					primaryComponent,
					primaryProps: {},
					layouts: layouts.map((component) => ({ component })),
					rendererCache: new Map(),
					renderComponentWithForeignChildren: renderWithoutChildren,
				},
				'<page />',
			);
		}

		it('fails with the name and file of a declared layout', async () => {
			await expect(compose([Outer, Dropping])).rejects.toThrow(
				'Layout dropping-layout (/app/dropping-layout.tsx) did not render its children',
			);
		});

		it('names a plain layout by its function name and the file of the page that uses it', async () => {
			const PlainLayout = () => '<aside />';

			await expect(
				composeSequentialLayoutChildren(
					{
						primaryComponent: stubComponent('page'),
						primaryProps: {},
						layouts: [{ component: PlainLayout as EcoComponent }],
						rendererCache: new Map(),
						renderComponentWithForeignChildren: async () => ({
							html: '<aside />',
							canAttachAttributes: true,
							integrationName: 'test',
						}),
					},
					'<page />',
				),
			).rejects.toThrow(new LayoutChildrenNotRenderedError('PlainLayout', '/app/page.tsx'));
		});

		it('passes a layout that renders its children and removes the check from the output', async () => {
			await expect(compose([Outer])).resolves.toEqual({ children: '<main><page /></main>' });
		});
	});
});
