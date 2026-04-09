import { describe, expect, it, vi } from 'vitest';
import { ReactHydrationAssetService } from './react-hydration-asset.service.ts';

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
});
