/**
 * Memory snapshot benchmark.
 *
 * Times N consecutive rebuilds and reports heap growth. Uses Vitest's
 * `bench()` API for stable timing.
 *
 * Run with:
 *
 *   pnpm test:bench
 */

import { bench, describe } from 'vitest';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { BrowserBundleService } from '../../../packages/core/src/services/assets/browser-bundle.service';
import { KITCHEN_SINK_PATHS, loadKitchenSinkConfig } from './_kitchen-sink-fixture';

const DIST_TMP = path.join(KITCHEN_SINK_PATHS.dist, '__bench-mem__');
mkdirSync(DIST_TMP, { recursive: true });

const ENTRYPOINT = path.join(KITCHEN_SINK_PATHS.pages, 'react-lab.react.tsx');

let browser: BrowserBundleService | undefined;
const setupBrowser = async () => {
	if (browser) return browser;
	const config = await loadKitchenSinkConfig();
	browser = new BrowserBundleService(config);
	return browser;
};

describe('memory-snap', () => {
	bench(
		'repeated rebuild of a single React page',
		async () => {
			const b = await setupBrowser();
			await b.bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [ENTRYPOINT],
				outdir: DIST_TMP,
				naming: `[name].[hash].tmp`,
				minify: false,
				root: KITCHEN_SINK_PATHS.root,
			});
		},
		{ time: 2000, iterations: 100, warmupTime: 200, warmupIterations: 5 },
	);
});
