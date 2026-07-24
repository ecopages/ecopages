import { describe, expect, it, vi } from 'vitest';
import type { EcoPageComponent, EcoPageFile } from '../../types/public-types.ts';
import { resolvePageDependenciesFromContext } from './resolved-page-dependencies.ts';

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
});
