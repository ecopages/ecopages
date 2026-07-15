import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { bench, group } from 'mitata';
import { BrowserBundleService } from '../../../packages/core/src/services/assets/browser-bundle.service';
import { KITCHEN_SINK_PATHS, loadKitchenSinkConfig } from './lib/kitchen-sink-fixture';

const DIST_TMP = path.join(KITCHEN_SINK_PATHS.dist, '__bench-prod__');
mkdirSync(DIST_TMP, { recursive: true });

const REACT_PAGES = [
	path.join(KITCHEN_SINK_PATHS.pages, 'react-lab.react.tsx'),
	path.join(KITCHEN_SINK_PATHS.pages, 'react-notes.react.tsx'),
	path.join(KITCHEN_SINK_PATHS.pages, 'react-server-metadata.react.tsx'),
];

let browser: BrowserBundleService | undefined;

async function setupBrowser(): Promise<BrowserBundleService> {
	browser ??= new BrowserBundleService(await loadKitchenSinkConfig());
	return browser;
}

export function registerBuildBench(): void {
	group('build-bench', () => {
		bench('production single page (minify + treeshake)', async () => {
			const service = await setupBrowser();
			await service.bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [REACT_PAGES[0]!],
				outdir: DIST_TMP,
				naming: `[name].[hash].prod.tmp`,
				minify: true,
				treeshaking: true,
				root: KITCHEN_SINK_PATHS.root,
			});
		});

		bench('production all pages (minify + treeshake + splitting)', async () => {
			const service = await setupBrowser();
			await service.bundle({
				profile: 'hmr-entrypoint',
				entrypoints: REACT_PAGES,
				outdir: DIST_TMP,
				naming: `[name].[hash].prod.tmp`,
				minify: true,
				treeshaking: true,
				splitting: true,
				root: KITCHEN_SINK_PATHS.root,
			});
		});
	});
}
