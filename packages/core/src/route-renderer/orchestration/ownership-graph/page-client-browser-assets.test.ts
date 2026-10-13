import { describe, expect, it, vi } from 'vitest';
import type { EcoComponent } from '../../../types/public-types.ts';
import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { buildPageClientBrowserAssets } from './page-client-browser-assets.ts';
import type { PageClientPlan } from './page-client-plan.ts';

const asset = (name: string, attributes?: Record<string, string>): ProcessedAsset =>
	({ kind: 'script', filepath: `/dist/${name}.js`, inline: false, attributes }) as ProcessedAsset;

function createPlan(overrides: Partial<PageClientPlan> = {}): PageClientPlan {
	const react = { config: {} } as EcoComponent;
	return {
		currentIntegrationName: 'kitajs',
		integrationNames: new Set(['kitajs', 'react']),
		lazyTriggers: [],
		lazyClientEntries: [],
		lazyConfigs: [],
		islandEntries: [{ component: react, file: '/app/counter.tsx', integrationName: 'react' }],
		sourceComponents: [react],
		...overrides,
	};
}

describe('buildPageClientBrowserAssets', () => {
	it('merges the owner islands with the grouped build of another hydrating integration', async () => {
		const counter = asset('counter');
		const ownIsland = asset('own');
		const buildPageClientBrowserAssetsOfReact = vi.fn(async () => ({
			processedAssets: [counter],
			islandRenderAssetsByFile: new Map([['/app/counter.tsx', [counter]]]),
			lazyTriggers: [],
		}));

		const result = await buildPageClientBrowserAssets({
			plan: createPlan(),
			integrationName: 'kitajs',
			collectOwnIslandAssets: async () => new Map([['/app/own.kita.tsx', [ownIsland]]]),
			resolveContributor: async () => ({
				contributesAppBrowserClientBuild: () => true,
				buildPageClientBrowserAssets: buildPageClientBrowserAssetsOfReact,
			}),
			processLazyEntries: async () => [],
			applyPendingLazyTriggers: () => [],
		});

		expect(result.processedAssets).toEqual([ownIsland, counter]);
		expect([...result.islandRenderAssetsByFile.keys()].sort()).toEqual(['/app/counter.tsx', '/app/own.kita.tsx']);
	});

	it('skips integrations that do not contribute to the app build and the owner itself', async () => {
		const resolveContributor = vi.fn(async () => ({
			contributesAppBrowserClientBuild: () => false,
			buildPageClientBrowserAssets: vi.fn(),
		}));

		const result = await buildPageClientBrowserAssets({
			plan: createPlan({
				islandEntries: [
					{ component: {} as EcoComponent, file: '/app/a.kita.tsx', integrationName: 'kitajs' },
					{ component: {} as EcoComponent, file: '/app/b.tsx', integrationName: 'react' },
				],
			}),
			integrationName: 'kitajs',
			collectOwnIslandAssets: async () => new Map(),
			resolveContributor,
			processLazyEntries: async () => [],
			applyPendingLazyTriggers: () => [],
		});

		expect(resolveContributor).toHaveBeenCalledTimes(1);
		expect(resolveContributor).toHaveBeenCalledWith('react');
		expect(result.processedAssets).toEqual([]);
	});

	it('processes lazy entries only when no contributed build already carries them', async () => {
		const lazyEntries = [{ kind: 'script', source: 'content', content: '1' }] as never;
		const processLazyEntries = vi.fn(async () => [asset('lazy')]);
		const run = (collected: ProcessedAsset[]) =>
			buildPageClientBrowserAssets({
				plan: createPlan({ islandEntries: [], lazyClientEntries: lazyEntries }),
				integrationName: 'kitajs',
				collectOwnIslandAssets: async () => new Map([['/app/own.kita.tsx', collected]]),
				resolveContributor: async () => undefined,
				processLazyEntries,
				applyPendingLazyTriggers: () => [],
			});

		const first = await run([asset('own')]);
		const second = await run([asset('own', { 'data-eco-lazy-key': 'k' })]);

		expect(processLazyEntries).toHaveBeenCalledTimes(1);
		expect(first.processedAssets.map((entry) => entry.filepath)).toEqual(['/dist/own.js', '/dist/lazy.js']);
		expect(second.processedAssets.map((entry) => entry.filepath)).toEqual(['/dist/own.js']);
	});
});
