/**
 * HMR rebuild benchmark for the React integration.
 *
 * Uses Vitest's native `bench()` API (via `tinybench`) for statistically
 * robust timing. Each `bench()` runs a closure repeatedly until `time` ms
 * have elapsed, then reports min/median/p95/etc.
 *
 * Run with:
 *
 *   pnpm test:bench
 *   pnpm test:bench --compare results/baseline.json
 *
 * Results are written to `playground/kitchen-sink/bench/results/vitest-bench.json`
 * by Vitest's `--outputJson` flag.
 */

import { bench, describe } from 'vitest';
import { mkdirSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { BrowserBundleService } from '../../../packages/core/src/services/assets/browser-bundle.service.ts';
import { KITCHEN_SINK_PATHS, loadKitchenSinkConfig } from './_kitchen-sink-fixture.ts';

const DIST_TMP = path.join(KITCHEN_SINK_PATHS.dist, '__bench__');
mkdirSync(DIST_TMP, { recursive: true });

const REACT_PAGE = path.join(KITCHEN_SINK_PATHS.pages, 'react-lab.react.tsx');
const LAYOUT_FILE = path.join(KITCHEN_SINK_PATHS.layouts, 'base-layout', 'base-layout.kita.tsx');
const SHARED_COMPONENT = path.join(KITCHEN_SINK_PATHS.components, 'react-counter.react.tsx');

const BUNDLE_OPTIONS_BASE = {
	profile: 'hmr-entrypoint' as const,
	outdir: DIST_TMP,
	naming: `[name].[hash].tmp`,
	minify: false,
	root: KITCHEN_SINK_PATHS.root,
};

let browser: BrowserBundleService | undefined;

const setupBrowser = async () => {
	if (browser) return browser;
	const config = await loadKitchenSinkConfig();
	browser = new BrowserBundleService(config);
	return browser;
};

function touchFile(filePath: string): void {
	const now = new Date();
	utimesSync(filePath, now, now);
}

describe('hmr-bench', () => {
	bench(
		'React page rebuild (react-lab.react.tsx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'layout rebuild (base-layout.kita.tsx)',
		async () => {
			const b = await setupBrowser();
			touchFile(LAYOUT_FILE);
			await b.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'shared-component rebuild (react-counter.react.tsx)',
		async () => {
			const b = await setupBrowser();
			touchFile(SHARED_COMPONENT);
			await b.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'concurrent rebuilds (5 parallel)',
		async () => {
			const b = await setupBrowser();
			await Promise.all(
				Array.from({ length: 5 }, () => b.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] })),
			);
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'no-op rebuild (file unchanged)',
		async () => {
			const b = await setupBrowser();
			await b.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'watch-session warm rebuild loop (10 sequential saves)',
		async () => {
			const b = await setupBrowser();
			for (let index = 0; index < 10; index += 1) {
				touchFile(REACT_PAGE);
				await b.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
			}
		},
		{ time: 2500, warmupTime: 400, warmupIterations: 1 },
	);
});
