import { describe, expect, it } from 'vitest';
import { eco } from './eco.ts';
import { mergePageDependencies } from './page-dependency-contributions.ts';

describe('page-dependency-contributions', () => {
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

		it('keeps file-owned contributions separate instead of flattening relative paths', () => {
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
				contributions: [
					{
						stylesheets: ['./page.css', './shared.css'],
						scripts: ['./page.js'],
						components: [Button],
					},
					{
						stylesheets: ['./shared.css', './entry.css'],
						scripts: ['./entry.js'],
						components: [Button, Counter],
						ownerFile: '/app/content/post.mdx',
					},
				],
			});
		});

		it('preserves modules when the other argument is empty or also declares modules', () => {
			const base = { modules: ['react-aria-components{Table}'] };

			expect(mergePageDependencies(base, {})).toEqual(base);
			expect(
				mergePageDependencies(base, {
					modules: ['react-aria-components{Select}'],
					ownerFile: '/app/content/post.mdx',
				}),
			).toEqual({
				contributions: [
					{ modules: ['react-aria-components{Table}'] },
					{
						modules: ['react-aria-components{Select}'],
						ownerFile: '/app/content/post.mdx',
					},
				],
			});
		});
	});
});
