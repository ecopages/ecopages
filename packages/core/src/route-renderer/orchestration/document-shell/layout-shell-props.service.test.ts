import { describe, expect, it } from 'vitest';
import { eco } from '../../../eco/eco.ts';
import {
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
			props: (context: { params?: Record<string, string> }) => ({
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
});
