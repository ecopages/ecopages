import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { eco } from '@ecopages/core';
import {
	composeLayoutPageTree,
	composeLayoutPageTreeFromShell,
	normalizePageLayoutComponents,
	resolveLayoutEntryProps,
	resolveLayoutContextFromShell,
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
		const Layout = ({ children }: { children?: string }) => createElement('main', null, children);
		const Page = eco.page({
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
		const Outer = ({ children }: { children?: string }) => createElement('outer', null, children);
		const Inner = ({ children }: { children?: string }) => createElement('inner', null, children);
		const Page = eco.page({
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

		const tree = composeLayoutPageTree(pageComponent(Page), { params: { slug: 'docs' } });
		expect(tree.props).toEqual({ section: 'docs', children: expect.any(Object) });
	});

	it('should normalize layout arrays from page config', () => {
		const Outer = () => null;
		const Inner = () => null;
		const Page = eco.page({
			layout: [Outer, Inner],
			render: () => null,
		});

		expect(normalizePageLayoutComponents(Page.config?.layouts)).toEqual([Outer, Inner]);
	});

	it('should compose explicit shell layouts outer to inner', () => {
		const Outer = ({ children }: { children?: string }) => createElement('outer', null, children);
		const Page = eco.page({ render: () => 'page' });

		const tree = composeLayoutPageTreeFromShell(pageComponent(Page), {}, [{ component: Outer }]);
		expect(tree.type).toBe(Outer);
	});

	it('should derive layout locals from shell props instead of pageProps.locals', () => {
		const Layout = ({ locals, children }: { locals?: { role: string }; children?: string }) =>
			createElement('section', null, locals?.role, children);
		const Page = eco.page({
			layout: Layout,
			render: () => 'page',
		});
		const routeLocals = { role: 'admin' };
		const pageLocals = { role: 'guarded' };

		const context = resolveLayoutContextFromShell({ locals: pageLocals }, [
			{ component: Layout, props: { locals: routeLocals } },
		]);
		const tree = composeLayoutPageTree(pageComponent(Page), { locals: pageLocals }, { context });

		expect(tree.props).toEqual({ locals: routeLocals, children: expect.any(Object) });
	});
});
