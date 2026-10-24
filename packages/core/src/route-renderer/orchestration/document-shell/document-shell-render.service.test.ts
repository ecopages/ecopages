import { describe, expect, it, vi } from 'vitest';
import type { EcoComponent } from '../../../types/contracts.ts';
import { eco } from '../../../eco/eco.ts';
import {
	composeDocumentShell,
	composeSequentialLayoutChildren,
	type DocumentShellComposeChildrenContext,
} from './document-shell-render.service.ts';

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
		const layoutRender = {
			html: '<layout><page /></layout>',
			canAttachAttributes: true,
			integrationName: 'test',
		};
		const renderComponentWithForeignChildren = vi.fn(async () => layoutRender);
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
			children: '<page />',
			integrationContext: { rendererCache },
		});
	});
});
