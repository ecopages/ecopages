/**
 * Production build benchmark for the React integration.
 *
 * Uses Vitest's native `bench()` API for production-style bundles
 * (minify + treeshake). Compares against the HMR scenarios to show the
 * perf gap between dev and prod paths.
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

const DIST_TMP = path.join(KITCHEN_SINK_PATHS.dist, '__bench-prod__');
mkdirSync(DIST_TMP, { recursive: true });

const REACT_PAGES = [
	path.join(KITCHEN_SINK_PATHS.pages, 'react-lab.react.tsx'),
	path.join(KITCHEN_SINK_PATHS.pages, 'react-notes.react.tsx'),
	path.join(KITCHEN_SINK_PATHS.pages, 'react-server-metadata.react.tsx'),
];

let browser: BrowserBundleService | undefined;
const setupBrowser = async () => {
	if (browser) return browser;
	const config = await loadKitchenSinkConfig();
	browser = new BrowserBundleService(config);
	return browser;
};

describe('build-bench', () => {
	bench(
		'production single page (minify + treeshake)',
		async () => {
			const b = await setupBrowser();
			await b.bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [REACT_PAGES[0]!],
				outdir: DIST_TMP,
				naming: `[name].[hash].prod.tmp`,
				minify: true,
				treeshaking: true,
				root: KITCHEN_SINK_PATHS.root,
			});
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'production all pages (minify + treeshake + splitting)',
		async () => {
			const b = await setupBrowser();
			await b.bundle({
				profile: 'hmr-entrypoint',
				entrypoints: REACT_PAGES,
				outdir: DIST_TMP,
				naming: `[name].[hash].prod.tmp`,
				minify: true,
				treeshaking: true,
				splitting: true,
				root: KITCHEN_SINK_PATHS.root,
			});
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);
});
