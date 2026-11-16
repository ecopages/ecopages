import { describe, expect, it, vi } from 'vitest';
import type { EcoPageComponent, EcoPageFile } from '../../types/contracts.ts';
import { resolvePageDependenciesFromContext } from './resolved-page-dependencies.ts';
import { eco } from '../../eco/eco.ts';

describe('resolvePageDependenciesFromContext', () => {
	it('invokes page resolveDependencies once and exposes components and contribution', async () => {
		const resolveDependencies = vi.fn(async () => ({
			scripts: ['/app/content/intro.mdx'],
			ownerFile: '/app/pages/docs/[...slug]/index.tsx',
		}));
		const page = {
			resolveDependencies,
		} as unknown as EcoPageComponent<unknown>;

		const resolved = await resolvePageDependenciesFromContext(
			{
				file: '/app/pages/docs/[...slug]/index.tsx',
				pageModule: { default: page } as EcoPageFile,
				props: { entry: { slug: 'intro' } },
				params: { slug: ['intro'] },
			},
			'react',
			async () => ({
				watchPaths: ['/app/content/intro.mdx'],
			}),
		);

		expect(resolveDependencies).toHaveBeenCalledOnce();
		expect(resolved?.components.length).toBeGreaterThan(0);
		expect(resolved?.contribution).toEqual({ watchPaths: ['/app/content/intro.mdx'] });
	});

	it("gives a Dynamic Page's resolver Params and Query only, never the request-derived props", async () => {
		const resolveDependencies = vi.fn(async () => ({ components: [] }));
		const page = eco.page({
			cache: 'dynamic',
			props: async ({ locals }) => ({ locals }),
			dependencies: resolveDependencies,
			render: () => '',
		});

		await resolvePageDependenciesFromContext(
			{
				file: '/app/pages/account/[id].tsx',
				pageModule: { default: page },
				props: { session: { userId: 'u1' } },
				params: { id: '7' },
				query: { tab: 'billing' },
			},
			'react',
		);

		expect(resolveDependencies).toHaveBeenCalledWith({ params: { id: '7' }, query: { tab: 'billing' } });
	});

	it("gives a Static Page's resolver its props", async () => {
		const resolveDependencies = vi.fn(async () => ({ components: [] }));
		const page = eco.page<{ slug: string }>({
			props: async () => ({ slug: 'intro' }),
			dependencies: resolveDependencies,
			render: () => '',
		});

		await resolvePageDependenciesFromContext(
			{
				file: '/app/pages/docs/[slug].tsx',
				pageModule: { default: page },
				props: { slug: 'intro' },
				params: { slug: 'intro' },
			},
			'react',
		);

		expect(resolveDependencies).toHaveBeenCalledWith({
			props: { slug: 'intro' },
			params: { slug: 'intro' },
			query: undefined,
		});
	});
});
