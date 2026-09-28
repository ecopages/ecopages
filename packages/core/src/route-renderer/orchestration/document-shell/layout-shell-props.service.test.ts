import { describe, expect, it } from 'vitest';
import { eco } from '../../../eco/eco.ts';
import type { LayoutPropsContext } from '../../../types/public-types.ts';
import {
	resolveDocumentShellLayouts,
	resolveLayoutEntryProps,
	resolveLayoutShellProps,
	resolvePageLayoutComponents,
} from './layout-shell-props.service.ts';

describe('layout-shell-props.service', () => {
	const Layout = eco.layout({
		identity: { id: 'layout', file: '/app/layouts/base.kita.tsx', integration: 'kitajs' },
		render: ({ children }) => `<layout>${children}</layout>`,
	});

	it('should resolve default layout shell props from locals', () => {
		expect(
			resolveLayoutShellProps({
				params: { slug: 'post' },
				query: { q: 'test' },
				locals: { user: 'Ada' },
			}),
		).toEqual({
			locals: { user: 'Ada' },
		});
	});

	it('should merge layout entry prop factories over shell props', () => {
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
		).toEqual({
			locals: { user: 'Ada' },
			section: 'admin',
		});
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
					locals: { user: 'Ada' },
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
		).toEqual([{ component: Layout, props: { locals: { user: 'Ada' } } }]);
	});
});
