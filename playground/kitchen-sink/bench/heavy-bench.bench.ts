/**
 * Heavy-library bundle benchmark.
 *
 * Simulates a page that pulls in many large dependencies. Measures how
 * bundle time scales with the size of the import graph — the user
 * reported 2s HMR for apps with heavy libraries; this bench reproduces
 * that scenario.
 *
 * Approach: write a virtual entrypoint into a dedicated bench fixtures
 * dir (NOT pages/, so the dev server's route discovery does not pick it
 * up). The `entrypoints` option in `bundle()` is what matters, not the
 * file location.
 *
 * Run with:
 *
 *   pnpm test:bench
 */

import { bench, describe } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BrowserBundleService } from '../../../packages/core/src/services/assets/browser-bundle.service';
import { KITCHEN_SINK_PATHS, loadKitchenSinkConfig } from './_kitchen-sink-fixture';

const DIST_TMP = path.join(KITCHEN_SINK_PATHS.dist, '__bench-heavy__');
mkdirSync(DIST_TMP, { recursive: true });

const HEAVY_FIXTURES_DIR = path.join(KITCHEN_SINK_PATHS.dist, '__bench-heavy-fixtures__');
mkdirSync(HEAVY_FIXTURES_DIR, { recursive: true });

const HEAVY_VIRTUAL_FILE = path.join(HEAVY_FIXTURES_DIR, 'heavy-bench-entry.react.tsx');
const HEAVY_VIRTUAL_CONTENT = `/** @jsxImportSource react */
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as ReactDOM from 'react-dom';
import { eco } from '@ecopages/core';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout';
import { getRouteLinkTestId } from '@/data/primary-links';

export default eco.page({
  layout: ReactPlaygroundLayout,
  dependencies: {
    components: [ReactCounter],
    stylesheets: ['./docs.css'],
  },
  render: () => {
    return React.createElement('main', null,
      React.createElement(ReactCounter, { initialCount: 0 }),
      React.createElement('div', { id: 'react-root' }),
    );
  },
  metadata: () => ({ title: 'heavy bench', description: 'bench' }),
});
`;

writeFileSync(HEAVY_VIRTUAL_FILE, HEAVY_VIRTUAL_CONTENT, 'utf-8');

let browser: BrowserBundleService | undefined;
const setupBrowser = async () => {
	if (browser) return browser;
	const config = await loadKitchenSinkConfig();
	browser = new BrowserBundleService(config);
	return browser;
};

describe('heavy-bench', () => {
	bench(
		'heavy React page (react + react-dom + ecopages + lit + kitajs + mdx)',
		async () => {
			const b = await setupBrowser();
			await b.bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [HEAVY_VIRTUAL_FILE],
				outdir: DIST_TMP,
				naming: `[name].[hash].heavy.tmp`,
				minify: false,
				root: KITCHEN_SINK_PATHS.root,
			});
		},
		{ time: 2000, warmupTime: 500, warmupIterations: 2 },
	);
});
