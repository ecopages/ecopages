import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { eco, type EcoPageComponent } from '@ecopages/core';
import { composeLayoutPageTree, normalizePageLayoutComponents, resolveLayoutEntryProps } from './layout-compose.ts';

function asLayoutPage(Page: EcoPageComponent<Record<string, unknown>>) {
	return Page as Parameters<typeof composeLayoutPageTree>[0];
}

describe('layout-compose', () => {
	it('should wrap a page with a single legacy layout', () => {
		const Layout = ({ children }: { children?: string }) => createElement('main', null, children);
		const Page = eco.page({
			layout: Layout,
			render: () => 'page',
		});

		const tree = composeLayoutPageTree(asLayoutPage(Page), { title: 'Hello' });
		expect(tree.type).toBe(Layout);
		expect((tree.props as { children?: { type: typeof Page; props?: { title: string } } }).children?.type).toBe(
			Page,
		);
		expect((tree.props as { children?: { props?: { title: string } } }).children?.props).toEqual({
			title: 'Hello',
		});
	});

	it('should nest multiple layouts outer to inner', () => {
		const Outer = ({ children }: { children?: string }) => createElement('outer', null, children);
		const Inner = ({ children }: { children?: string }) => createElement('inner', null, children);
		const Page = eco.page({
			layout: [Outer, Inner],
			render: () => 'page',
		});

		const tree = composeLayoutPageTree(asLayoutPage(Page), {});
		expect(tree.type).toBe(Outer);
		expect((tree.props as { children?: { type: typeof Inner } }).children?.type).toBe(Inner);
		expect(
			(tree.props as { children?: { props?: { children?: { type: typeof Page } } } }).children?.props?.children
				?.type,
		).toBe(Page);
	});

	it('should merge layout entry prop factories', () => {
		const Layout = ({ section }: { section?: string; children?: string }) =>
			createElement('section', null, section);
		const Page = eco.page({
			layout: [{ component: Layout, props: ({ params }) => ({ section: params?.slug }) }],
			render: () => 'page',
		});

		expect(
			resolveLayoutEntryProps(Page.config!.layoutEntries![0]!, {
				params: { slug: 'docs' },
			}),
		).toEqual({ section: 'docs' });

		const tree = composeLayoutPageTree(asLayoutPage(Page), { params: { slug: 'docs' } });
		expect(tree.props).toEqual({ section: 'docs', children: expect.any(Object) });
	});

	it('should normalize layout arrays from page config', () => {
		const Outer = () => null;
		const Inner = () => null;
		const Page = eco.page({
			layout: [Outer, Inner],
			render: () => null,
		});

		expect(normalizePageLayoutComponents(Page.config?.layouts, Page.config?.layout)).toEqual([Outer, Inner]);
	});
});
