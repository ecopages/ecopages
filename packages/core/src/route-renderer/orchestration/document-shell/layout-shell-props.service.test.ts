import { describe, expect, it } from 'vitest';
import { eco } from '../../../eco/eco.ts';
import type { LayoutPropsContext, LayoutRequestContext } from '../../../types/contracts.ts';
import {
	resolveDocumentShellLayouts,
	resolveLayoutEntryProps,
	resolveRenderLayouts,
	resolvePageLayoutComponents,
} from './layout-shell-props.service.ts';

describe('layout-shell-props.service', () => {
	const Layout = eco.layout({
		identity: { id: 'layout', file: '/app/layouts/base.kita.tsx', integration: 'kitajs' },
		render: ({ children }) => `<layout>${children}</layout>`,
	});

	it('should resolve layout entry props from the factory only, without injecting locals', () => {
		const entry = {
			component: Layout,
			props: (context: LayoutPropsContext) => ({
				section: context.params?.slug,
			}),
		};

		expect(
			resolveLayoutEntryProps(entry, {
				params: { slug: 'admin' },
				query: {},
				locals: { user: 'Ada' },
			}),
		).toEqual({ section: 'admin' });
	});

	it("should give a factory the request's locals on a Dynamic Page", () => {
		const locals = { user: 'Ada' };
		const Page = eco.page({
			cache: 'dynamic',
			layout: { component: Layout, props: (context) => ({ same: context.locals === locals }) },
			render: () => '',
		});

		expect(resolveLayoutEntryProps(Page.config!.layoutEntries![0]!, { locals })).toEqual({ same: true });
	});

	it('should give a factory empty locals when the render has none, as a Static Page renders', () => {
		let received: unknown;
		const entry = {
			component: Layout,
			props: (context: LayoutRequestContext) => {
				received = context.locals;
				return {};
			},
		};

		resolveLayoutEntryProps(entry, { params: { slug: 'intro' } });

		expect(received).toEqual({});
	});

	it('should give a layout entry without a factory no props', () => {
		expect(resolveLayoutEntryProps({ component: Layout }, { locals: { user: 'Ada' } })).toEqual({});
	});

	it('should return an empty stack when layouts are missing', () => {
		expect(resolvePageLayoutComponents(undefined)).toEqual([]);
	});

	it('should resolve document-shell layouts from layout entry factories', () => {
		const entry = {
			component: Layout,
			props: (context: LayoutPropsContext) => ({
				prose: false,
				section: context.params?.slug,
			}),
		};

		expect(
			resolveDocumentShellLayouts({
				layoutEntries: [entry],
				params: { slug: 'intro' },
				locals: { user: 'Ada' },
			}),
		).toEqual([
			{
				component: Layout,
				props: {
					prose: false,
					section: 'intro',
				},
			},
		]);
	});

	it('should fall back to a single layout component when entries are absent', () => {
		expect(
			resolveDocumentShellLayouts({
				layout: Layout,
				locals: { user: 'Ada' },
			}),
		).toEqual([{ component: Layout, props: {} }]);
	});

	it('should resolve the layouts of one render once, however many callers ask', () => {
		let calls = 0;
		const render = {};
		const input = {
			layoutEntries: [
				{
					component: Layout,
					props: () => {
						calls += 1;
						return { call: calls };
					},
				},
			],
		};

		const first = resolveRenderLayouts(render, input);
		const second = resolveRenderLayouts(render, input);

		expect(second).toBe(first);
		expect(first).toEqual([{ component: Layout, props: { call: 1 } }]);
		expect(calls).toBe(1);
		expect(resolveRenderLayouts({}, input)[0]?.props).toEqual({ call: 2 });
	});
});
