import { describe, expect, it } from 'vitest';
import type { EcoComponentConfig, LayoutPropsContext } from '../types/public-types.ts';
import { eco } from './eco.ts';
import {
	applyPageLayoutConfig,
	ensurePageConfigLayouts,
	mergeLayoutDependencies,
	mergePageDependencies,
	normalizePageLayouts,
} from './page-layout-normalization.ts';

describe('page-layout-normalization', () => {
	const OuterLayout = eco.layout({
		identity: { id: 'outer', file: '/app/layouts/outer.kita.tsx', integration: 'kitajs' },
		render: ({ children }) => `<outer>${children}</outer>`,
	});
	const InnerLayout = eco.layout({
		identity: { id: 'inner', file: '/app/layouts/inner.kita.tsx', integration: 'kitajs' },
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
		const props = (context: LayoutPropsContext) => ({
			section: context.params?.slug ?? 'default',
		});

		expect(normalizePageLayouts([OuterLayout, { component: InnerLayout, props }])).toEqual([
			{ component: OuterLayout },
			{ component: InnerLayout, props },
		]);
	});

	it('should merge layout components into dependencies without duplicates', () => {
		const Button = eco.component({
			identity: { id: 'button', file: '/app/components/button.kita.tsx', integration: 'kitajs' },
			render: () => '<button />',
		});

		const merged = mergeLayoutDependencies(
			{ components: [Button, OuterLayout] },
			normalizePageLayouts([OuterLayout, InnerLayout]),
		);

		expect(merged?.components).toEqual([Button, OuterLayout, InnerLayout]);
	});

	it('should write layouts and layoutEntries onto page config', () => {
		const config = {} as EcoComponentConfig;
		const entries = normalizePageLayouts([OuterLayout, InnerLayout]);

		applyPageLayoutConfig(config, entries);

		expect(config.layouts).toEqual([OuterLayout, InnerLayout]);
		expect(config.layoutEntries).toEqual(entries);
	});

	it('should migrate MDX-exported config.layout onto config.layouts', () => {
		const config = { layout: InnerLayout } as EcoComponentConfig & { layout: typeof InnerLayout };

		ensurePageConfigLayouts(config);

		expect(config.layouts).toEqual([InnerLayout]);
		expect(config.layoutEntries).toEqual([{ component: InnerLayout }]);
	});

	it('should leave configs with existing layouts unchanged', () => {
		const config = { layouts: [InnerLayout] } as EcoComponentConfig;

		ensurePageConfigLayouts(config);

		expect(config.layouts).toEqual([InnerLayout]);
	});

	describe('mergePageDependencies', () => {
		it('returns undefined when both inputs are undefined', () => {
			expect(mergePageDependencies(undefined, undefined)).toBeUndefined();
		});

		it('returns additional when base is undefined', () => {
			const entryDeps = { stylesheets: ['./post.css'], ownerFile: '/content/post.mdx' };
			expect(mergePageDependencies(undefined, entryDeps)).toEqual(entryDeps);
		});

		it('returns base when additional is undefined', () => {
			const baseDeps = { stylesheets: ['./page.css'] };
			expect(mergePageDependencies(baseDeps, undefined)).toEqual(baseDeps);
		});

		it('merges stylesheets, scripts, and components without duplicates and preserves ownerFile', () => {
			const Button = eco.component({
				identity: { id: 'btn', file: '/app/btn.kita.tsx', integration: 'kitajs' },
				render: () => '',
			});
			const Counter = eco.component({
				identity: { id: 'cnt', file: '/app/cnt.kita.tsx', integration: 'kitajs' },
				render: () => '',
			});

			const base = {
				stylesheets: ['./page.css', './shared.css'],
				scripts: ['./page.js'],
				components: [Button],
			};
			const additional = {
				stylesheets: ['./shared.css', './entry.css'],
				scripts: ['./entry.js'],
				components: [Button, Counter],
				ownerFile: '/app/content/post.mdx',
			};

			expect(mergePageDependencies(base, additional)).toEqual({
				stylesheets: ['./page.css', './shared.css', './entry.css'],
				scripts: ['./page.js', './entry.js'],
				components: [Button, Counter],
				ownerFile: '/app/content/post.mdx',
			});
		});
	});
});
