import { rapidhash } from '@ecopages/core/hash';
import { describe, expect, it, vi } from 'vitest';
import { getReactIslandComponentKey, ReactHydrationAssetService } from './react-hydration-asset.service.ts';

describe('ReactHydrationAssetService', () => {
	it('uses the React-owned HMR entrypoint path for hydration assets in development', async () => {
		const registerScriptEntrypoint = vi.fn(async () => '/assets/_hmr/pages/index.js');
		const registerEntrypoint = vi.fn(async () => '/assets/_hmr/pages/index.js');
		const service = new ReactHydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => ({
					isEnabled: () => true,
					registerScriptEntrypoint,
					registerEntrypoint,
				}),
			} as any,
			bundleService: {
				getRuntimeImports: () => ({
					react: 'react',
					reactDomClient: 'react-dom/client',
					router: undefined,
				}),
			} as any,
		});

		const importPath = await service.resolveAssetImportPath('/app/src/pages/index.tsx', 'ecopages-react-index');

		expect(importPath).toBe('/assets/_hmr/pages/index.js');
		expect(registerEntrypoint).toHaveBeenCalledWith('/app/src/pages/index.tsx');
		expect(registerScriptEntrypoint).not.toHaveBeenCalled();
	});

	it('reuses the same bundled island asset for different component instances', async () => {
		const processDependencies = vi.fn(async () => []);
		const createBundleOptions = vi.fn(async () => ({}));
		const service = new ReactHydrationAssetService({
			srcDir: '/app/src',
			assetProcessingService: {
				getHmrManager: () => undefined,
				processDependencies,
			} as unknown as ConstructorParameters<typeof ReactHydrationAssetService>[0]['assetProcessingService'],
			bundleService: {
				createBundleOptions,
				getRuntimeImports: () => ({
					react: 'react',
					reactDomClient: 'react-dom/client',
					router: undefined,
				}),
			} as unknown as ConstructorParameters<typeof ReactHydrationAssetService>[0]['bundleService'],
		});

		await service.buildComponentRenderAssets('/app/src/components/counter.tsx', {
			__eco: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});
		await service.buildComponentRenderAssets('/app/src/components/counter.tsx', {
			__eco: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});

		expect(createBundleOptions).toHaveBeenNthCalledWith(
			1,
			`ecopages-react-island-${rapidhash('/app/src/components/counter.tsx')}`,
			false,
			[],
		);
		expect(createBundleOptions).toHaveBeenNthCalledWith(
			2,
			`ecopages-react-island-${rapidhash('/app/src/components/counter.tsx')}`,
			false,
			[],
		);

		const [firstDependencies, firstKey] = processDependencies.mock.calls[0] as unknown as [
			Array<{ name: string; content?: string; attributes?: Record<string, string> }>,
			string,
		];
		const [secondDependencies, secondKey] = processDependencies.mock.calls[1] as unknown as [
			Array<{ name: string; content?: string; attributes?: Record<string, string> }>,
			string,
		];

		const [firstBundle, firstHydration] = firstDependencies;
		const [secondBundle, secondHydration] = secondDependencies;
		const componentKey = getReactIslandComponentKey('/app/src/components/counter.tsx', {
			__eco: { id: 'Counter', file: '/app/src/components/counter.tsx', integration: 'react' },
		});

		expect(firstKey).toBe(`ecopages-react-island-${rapidhash('/app/src/components/counter.tsx')}`);
		expect(secondKey).toBe(`ecopages-react-island-${rapidhash('/app/src/components/counter.tsx')}`);
		expect(secondBundle.name).toBe(firstBundle.name);
		expect(secondHydration.name).toBe(firstHydration.name);
		expect(firstHydration.attributes?.['data-eco-script-id']).toBe(firstHydration.name);
		expect(secondHydration.attributes?.['data-eco-script-id']).toBe(secondHydration.name);
		expect(firstHydration.content).toContain('ecopages-react-island-');
		expect(firstHydration.content).toContain(`[data-eco-component-key=\\"${componentKey}\\"]`);
		expect(secondHydration.content).toContain(`[data-eco-component-key=\\"${componentKey}\\"]`);
		expect(firstHydration.content).toContain('querySelectorAll');
		expect(firstHydration.content).toContain(firstBundle.name);
		expect(secondHydration.content).toContain(secondBundle.name);
	});
});
