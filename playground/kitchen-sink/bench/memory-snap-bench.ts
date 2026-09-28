import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { bench, group } from 'mitata';
import { BrowserBundleService } from '../../../packages/core/src/services/assets/browser-bundle.service';
import { KITCHEN_SINK_PATHS, loadKitchenSinkConfig } from './lib/kitchen-sink-fixture';

const DIST_TMP = path.join(KITCHEN_SINK_PATHS.dist, '__bench-mem__');
mkdirSync(DIST_TMP, { recursive: true });

const ENTRYPOINT = path.join(KITCHEN_SINK_PATHS.pages, 'react-lab.react.tsx');

let browser: BrowserBundleService | undefined;

async function setupBrowser(): Promise<BrowserBundleService> {
	browser ??= new BrowserBundleService(await loadKitchenSinkConfig());
	return browser;
}

export function registerMemorySnapBench(): void {
	group('memory-snap', () => {
		bench('repeated rebuild of a single React page', async () => {
			const service = await setupBrowser();
			await service.bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [ENTRYPOINT],
				outdir: DIST_TMP,
				naming: `[name].[hash].tmp`,
				minify: false,
				root: KITCHEN_SINK_PATHS.root,
			});
		});
	});
}
