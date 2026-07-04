import { describe, expect, it } from 'vitest';
import type { EcoComponentConfig } from '../types/public-types.ts';
import { eco } from './eco.ts';
import { applyPageLayoutConfig, mergeLayoutDependencies, normalizePageLayouts } from './page-layout-normalization.ts';

describe('page-layout-normalization', () => {
	const OuterLayout = eco.layout({
		__eco: { id: 'outer', file: '/app/layouts/outer.kita.tsx', integration: 'kitajs' },
		render: ({ children }) => `<outer>${children}</outer>`,
	});
	const InnerLayout = eco.layout({
		__eco: { id: 'inner', file: '/app/layouts/inner.kita.tsx', integration: 'kitajs' },
		render: ({ children }) => `<inner>${children}</inner>`,
	});

	it('should normalize a single layout to a one-item stack', () => {
		expect(normalizePageLayouts(OuterLayout)).toEqual([{ component: OuterLayout }]);
	});

	it('should preserve outer→inner order for layout arrays', () => {
		expect(normalizePageLayouts([OuterLayout, InnerLayout])).toEqual([
			{ component: OuterLayout },
			{ component: InnerLayout },
		]);
	});

	it('should retain layout prop factories on normalized entries', () => {
		const props = (context: { params?: Record<string, string> }) => ({
			section: context.params?.slug ?? 'default',
		});

		expect(normalizePageLayouts([OuterLayout, { component: InnerLayout, props }])).toEqual([
			{ component: OuterLayout },
			{ component: InnerLayout, props },
		]);
	});

	it('should merge layout components into dependencies without duplicates', () => {
		const Button = eco.component({
			__eco: { id: 'button', file: '/app/components/button.kita.tsx', integration: 'kitajs' },
			render: () => '<button />',
		});

		const merged = mergeLayoutDependencies(
			{ components: [Button, OuterLayout] },
			normalizePageLayouts([OuterLayout, InnerLayout]),
		);

		expect(merged?.components).toEqual([Button, OuterLayout, InnerLayout]);
	});

	it('should write layouts, layoutEntries, and innermost layout alias onto page config', () => {
		const config = {} as EcoComponentConfig;
		const entries = normalizePageLayouts([OuterLayout, InnerLayout]);

		applyPageLayoutConfig(config, entries);

		expect(config.layouts).toEqual([OuterLayout, InnerLayout]);
		expect(config.layoutEntries).toEqual(entries);
		expect(config.layout).toBe(InnerLayout);
	});
});
