import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { eco, type LayoutProps } from '@ecopages/core';
import {
	composeLayoutPageTree,
	composeLayoutPageTreeFromShell,
	normalizePageLayoutComponents,
	resolveLayoutEntryProps,
	type ComposablePage,
} from './layout-compose.ts';

function pageComponent<P extends Record<string, unknown>>(Page: ComposablePage<P>): ComposablePage<P> {
	if (typeof Page !== 'function') {
		throw new TypeError('Expected function page component.');
	}
	return Page;
}

describe('layout-compose', () => {
	it('should wrap a page with a single legacy layout', () => {
		const Layout = ({ children }: { children?: ReactNode }) => createElement('main', null, children);
		const Page = eco.page<{}, ReactNode>({
			layout: Layout,
			render: () => 'page',
		});

		const tree = composeLayoutPageTree(pageComponent(Page), { title: 'Hello' } as Record<string, unknown>);
		expect(tree.type).toBe(Layout);
		expect((tree.props as { children?: { type: typeof Page; props?: { title: string } } }).children?.type).toBe(
			Page,
		);
		expect((tree.props as { children?: { props?: { title: string } } }).children?.props).toEqual({
			title: 'Hello',
		});
	});

	it('should nest multiple layouts outer to inner', () => {
		const Outer = ({ children }: { children?: ReactNode }) => createElement('outer', null, children);
		const Inner = ({ children }: { children?: ReactNode }) => createElement('inner', null, children);
		const Page = eco.page<{}, ReactNode>({
			layout: [Outer, Inner],
			render: () => 'page',
		});

		const tree = composeLayoutPageTree(pageComponent(Page), {});
		expect(tree.type).toBe(Outer);
		expect((tree.props as { children?: { type: typeof Inner } }).children?.type).toBe(Inner);
		expect(
			(tree.props as { children?: { props?: { children?: { type: typeof Page } } } }).children?.props?.children
				?.type,
		).toBe(Page);
	});

	it('should merge layout entry prop factories', () => {
		const Layout = ({ section }: { section?: string; children?: ReactNode }) =>
			createElement('section', null, section);
		const Page = eco.page<{}, ReactNode>({
			layout: [{ component: Layout, props: ({ params }) => ({ section: params?.slug }) }],
			render: () => 'page',
		});

		expect(
			resolveLayoutEntryProps(Page.config!.layoutEntries![0]!, {
				params: { slug: 'docs' },
			}),
		).toEqual({ section: 'docs' });

		const tree = composeLayoutPageTree(pageComponent(Page), { params: { slug: 'docs' } });
		expect(tree.props).toEqual({ section: 'docs', children: expect.any(Object) });
	});

	it('should normalize layout arrays from page config', () => {
		const Outer = () => null;
		const Inner = () => null;
		const Page = eco.page<{}, ReactNode>({
			layout: [Outer, Inner],
			render: () => null,
		});

		expect(normalizePageLayoutComponents(Page.config?.layouts)).toEqual([Outer, Inner]);
	});

	it('should compose explicit shell layouts outer to inner', () => {
		const Outer = ({ children }: { children?: ReactNode }) => createElement('outer', null, children);
		const Page = eco.page<{}, ReactNode>({ render: () => 'page' });

		const tree = composeLayoutPageTreeFromShell(pageComponent(Page), {}, [{ component: Outer }]);
		expect(tree.type).toBe(Outer);
	});

	it('should apply persisted layout tiers when a resolver is provided', () => {
		const Layout = ({ children }: { children?: ReactNode }) => createElement('section', null, children);
		const CachedLayout = ({ children }: { children?: ReactNode }) => createElement('cached', null, children);
		const Page = eco.page<{}, ReactNode>({
			layout: Layout,
			render: () => 'page',
		});

		const tree = composeLayoutPageTree(
			pageComponent(Page),
			{},
			{
				resolvePersistedTier: () => ({ layout: CachedLayout, key: 'layout-key' }),
			},
		);

		expect(tree.type).toBe(CachedLayout);
		expect(tree.key).toBe('layout-key');
	});

	it('should give a layout request locals only through its props factory', () => {
		const Layout = ({ children }: LayoutProps<ReactNode>) => createElement('section', null, children);
		const Page = eco.page<{}, ReactNode>({
			cache: 'dynamic',
			layout: [
				{ component: Layout, props: ({ locals }: { locals: { role?: string } }) => ({ role: locals.role }) },
			],
			render: () => 'page',
		});

		const withLocals = composeLayoutPageTree(pageComponent(Page), {}, { context: { locals: { role: 'admin' } } });
		const withoutFactory = composeLayoutPageTree(
			pageComponent(eco.page<{}, ReactNode>({ layout: Layout, render: () => 'page' })),
			{},
			{ context: { locals: { role: 'guarded' } } },
		);

		expect(withLocals.props).toEqual({ role: 'admin', children: expect.any(Object) });
		expect(withoutFactory.props).toEqual({ children: expect.any(Object) });
	});
});
