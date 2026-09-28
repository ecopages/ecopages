import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bench, group } from 'mitata';
import { BrowserBundleService } from '../../../packages/core/src/services/assets/browser-bundle.service';
import { KITCHEN_SINK_PATHS, loadKitchenSinkConfig } from './lib/kitchen-sink-fixture';

const DIST_TMP = path.join(KITCHEN_SINK_PATHS.dist, '__bench-heavy__');
mkdirSync(DIST_TMP, { recursive: true });

const HEAVY_FIXTURES_DIR = path.join(KITCHEN_SINK_PATHS.dist, '__bench-heavy-fixtures__');
mkdirSync(HEAVY_FIXTURES_DIR, { recursive: true });

const HEAVY_VIRTUAL_FILE = path.join(HEAVY_FIXTURES_DIR, 'heavy-bench-entry.react.tsx');
writeFileSync(
	HEAVY_VIRTUAL_FILE,
	`/** @jsxImportSource react */
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as ReactDOM from 'react-dom';
import { eco } from '@ecopages/core';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout.react';
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
`,
	'utf-8',
);

let browser: BrowserBundleService | undefined;

async function setupBrowser(): Promise<BrowserBundleService> {
	browser ??= new BrowserBundleService(await loadKitchenSinkConfig());
	return browser;
}

export function registerHeavyBench(): void {
	group('heavy-bench', () => {
		bench('heavy React page (react + react-dom + ecopages + lit + kitajs + mdx)', async () => {
			const service = await setupBrowser();
			await service.bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [HEAVY_VIRTUAL_FILE],
				outdir: DIST_TMP,
				naming: `[name].[hash].heavy.tmp`,
				minify: false,
				root: KITCHEN_SINK_PATHS.root,
			});
		});
	});
}
