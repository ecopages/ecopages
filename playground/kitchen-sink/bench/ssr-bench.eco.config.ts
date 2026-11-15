import { defineConfig } from '@ecopages/core/config';
import { createKitchenSinkUserConfig } from '../kitchen-sink-config.ts';

/**
 * Kitchen-sink config for the SSR throughput bench (`ssr-bench.mts`).
 *
 * @remarks
 * Builds into `dist-bench-ssr` so the bench never touches `dist/`. The page cache is off by default, so every
 * request renders its page; `start` otherwise renders a page once and answers later requests from an in-memory
 * cache. Set `ECOPAGES_BENCH_SSR_CACHE=1` to leave the cache on and measure the cache-hit path instead.
 */
export default defineConfig({
	...createKitchenSinkUserConfig({ distDir: 'dist-bench-ssr', workDir: '.eco-bench-ssr' }),
	cache: { enabled: process.env.ECOPAGES_BENCH_SSR_CACHE === '1' },
});
