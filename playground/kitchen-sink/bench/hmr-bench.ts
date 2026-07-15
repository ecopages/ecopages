import { mkdirSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { bench, group } from 'mitata';
import { BrowserBundleService } from '../../../packages/core/src/services/assets/browser-bundle.service';
import { KITCHEN_SINK_PATHS, loadKitchenSinkConfig } from './lib/kitchen-sink-fixture';

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

async function setupBrowser(): Promise<BrowserBundleService> {
	browser ??= new BrowserBundleService(await loadKitchenSinkConfig());
	return browser;
}

function touchFile(filePath: string): void {
	const now = new Date();
	utimesSync(filePath, now, now);
}

export function registerHmrBench(): void {
	group('hmr-bench', () => {
		bench('React page rebuild (react-lab.react.tsx)', async () => {
			const service = await setupBrowser();
			await service.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
		});

		bench('layout rebuild (base-layout.kita.tsx)', async () => {
			const service = await setupBrowser();
			touchFile(LAYOUT_FILE);
			await service.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
		});

		bench('shared-component rebuild (react-counter.react.tsx)', async () => {
			const service = await setupBrowser();
			touchFile(SHARED_COMPONENT);
			await service.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
		});

		bench('concurrent rebuilds (5 parallel)', async () => {
			const service = await setupBrowser();
			await Promise.all(
				Array.from({ length: 5 }, () => service.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] })),
			);
		});

		bench('no-op rebuild (file unchanged)', async () => {
			const service = await setupBrowser();
			await service.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
		});

		bench('watch-session warm rebuild loop (10 sequential saves)', async () => {
			const service = await setupBrowser();
			for (let index = 0; index < 10; index += 1) {
				touchFile(REACT_PAGE);
				await service.bundle({ ...BUNDLE_OPTIONS_BASE, entrypoints: [REACT_PAGE] });
			}
		});
	});
}
