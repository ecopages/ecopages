import { describe, expect, it, vi } from 'vitest';
import { LitSsrLazyPreloader } from '../lit-ssr-lazy-preloader.ts';

describe('LitSsrLazyPreloader', () => {
	it('prefers source imports when configured for Bun-style SSR preload', async () => {
		const processDependencies = vi.fn(async () => [
			{ filepath: '/app/.eco/assets/components/lit-counter.script.js' },
		]);
		const preloader = new LitSsrLazyPreloader({
			resolveDependencyPath: (_componentDir, sourcePath) => sourcePath,
			processDependencies,
			preferSourceImports: true,
		});

		const entrypoint = await preloader.resolveSsrPreloadEntrypoint('/app/src/components/lit-counter.script.ts');

		expect(entrypoint).toBe('/app/src/components/lit-counter.script.ts');
		expect(processDependencies).not.toHaveBeenCalled();
	});

	it('uses processed preload entrypoints when source imports are not preferred', async () => {
		const processDependencies = vi.fn(async () => [
			{ filepath: '/app/.eco/assets/components/lit-counter.script.js' },
		]);
		const preloader = new LitSsrLazyPreloader({
			resolveDependencyPath: (_componentDir, sourcePath) => sourcePath,
			processDependencies,
			preferSourceImports: false,
		});

		const entrypoint = await preloader.resolveSsrPreloadEntrypoint('/app/src/components/lit-counter.script.ts');

		expect(entrypoint).toBe('/app/.eco/assets/components/lit-counter.script.js');
		expect(processDependencies).toHaveBeenCalledTimes(1);
	});
});
