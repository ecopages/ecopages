/**
 * Cross-integration bundle benchmark.
 *
 * Measures the bundle path for each integration supported by ecopages
 * (React, KitaJS, Lit, Ecopages-JSX) on a representative entrypoint.
 * Use to detect whether the perf characteristics we see in the React
 * bench are React-specific or global.
 *
 * Each scenario bundles a single real page from the kitchen-sink
 * through the same `BrowserBundleService` path the HMR watcher uses.
 *
 * Run with:
 *
 *   pnpm test:bench
 */

import { bench, describe } from 'vitest';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { BrowserBundleService } from '../../../packages/core/src/services/assets/browser-bundle.service.ts';
import { KITCHEN_SINK_PATHS, loadKitchenSinkConfig } from './_kitchen-sink-fixture.ts';

const DIST_TMP = path.join(KITCHEN_SINK_PATHS.dist, '__bench-integration__');
mkdirSync(DIST_TMP, { recursive: true });

const ENTRYPOINTS = {
	react: path.join(KITCHEN_SINK_PATHS.pages, 'react-lab.react.tsx'),
	reactServer: path.join(KITCHEN_SINK_PATHS.pages, 'react-server-metadata.react.tsx'),
	reactServerFiles: path.join(KITCHEN_SINK_PATHS.pages, 'react-server-files', 'index.react.tsx'),
	kita: path.join(KITCHEN_SINK_PATHS.pages, 'api-lab.kita.tsx'),
	kitaTransitions: path.join(KITCHEN_SINK_PATHS.pages, 'transitions.kita.tsx'),
	kitaPostcss: path.join(KITCHEN_SINK_PATHS.pages, 'postcss.kita.tsx'),
	lit: path.join(KITCHEN_SINK_PATHS.pages, 'integration-matrix', 'lit-entry.lit.tsx'),
	ecopagesJsx: path.join(KITCHEN_SINK_PATHS.pages, 'integration-matrix', 'ecopages-jsx-entry.eco.tsx'),
	kitaCatalog: path.join(KITCHEN_SINK_PATHS.pages, 'catalog', '[slug].kita.tsx'),
};

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

const optionsFor = (entrypoint: string) => ({
	...BUNDLE_OPTIONS_BASE,
	entrypoints: [entrypoint],
});

describe('integration-bench', () => {
	bench(
		'React page (.react.tsx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle(optionsFor(ENTRYPOINTS.react));
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'React server-metadata page (.react.tsx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle(optionsFor(ENTRYPOINTS.reactServer));
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'React server-files index (.react.tsx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle(optionsFor(ENTRYPOINTS.reactServerFiles));
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'KitaJS page (.kita.tsx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle(optionsFor(ENTRYPOINTS.kita));
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'KitaJS transitions page (.kita.tsx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle(optionsFor(ENTRYPOINTS.kitaTransitions));
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'KitaJS postcss page (.kita.tsx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle(optionsFor(ENTRYPOINTS.kitaPostcss));
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'KitaJS dynamic route catalog/[slug].kita.tsx',
		async () => {
			const b = await setupBrowser();
			await b.bundle(optionsFor(ENTRYPOINTS.kitaCatalog));
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'Lit page (.lit.tsx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle(optionsFor(ENTRYPOINTS.lit));
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);

	bench(
		'Ecopages-JSX page (.eco.tsx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle(optionsFor(ENTRYPOINTS.ecopagesJsx));
		},
		{ time: 1500, warmupTime: 300, warmupIterations: 2 },
	);
});
