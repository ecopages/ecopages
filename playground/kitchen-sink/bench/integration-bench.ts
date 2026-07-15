import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { bench, group } from 'mitata';
import { BrowserBundleService } from '../../../packages/core/src/services/assets/browser-bundle.service';
import { KITCHEN_SINK_PATHS, loadKitchenSinkConfig } from './lib/kitchen-sink-fixture';

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

async function setupBrowser(): Promise<BrowserBundleService> {
	browser ??= new BrowserBundleService(await loadKitchenSinkConfig());
	return browser;
}

function optionsFor(entrypoint: string) {
	return {
		...BUNDLE_OPTIONS_BASE,
		entrypoints: [entrypoint],
	};
}

export function registerIntegrationBench(): void {
	group('integration-bench', () => {
		bench('React page (.react.tsx)', async () => {
			await (await setupBrowser()).bundle(optionsFor(ENTRYPOINTS.react));
		});
		bench('React server-metadata page (.react.tsx)', async () => {
			await (await setupBrowser()).bundle(optionsFor(ENTRYPOINTS.reactServer));
		});
		bench('React server-files index (.react.tsx)', async () => {
			await (await setupBrowser()).bundle(optionsFor(ENTRYPOINTS.reactServerFiles));
		});
		bench('KitaJS page (.kita.tsx)', async () => {
			await (await setupBrowser()).bundle(optionsFor(ENTRYPOINTS.kita));
		});
		bench('KitaJS transitions page (.kita.tsx)', async () => {
			await (await setupBrowser()).bundle(optionsFor(ENTRYPOINTS.kitaTransitions));
		});
		bench('KitaJS postcss page (.kita.tsx)', async () => {
			await (await setupBrowser()).bundle(optionsFor(ENTRYPOINTS.kitaPostcss));
		});
		bench('KitaJS dynamic route catalog/[slug].kita.tsx', async () => {
			await (await setupBrowser()).bundle(optionsFor(ENTRYPOINTS.kitaCatalog));
		});
		bench('Lit page (.lit.tsx)', async () => {
			await (await setupBrowser()).bundle(optionsFor(ENTRYPOINTS.lit));
		});
		bench('Ecopages-JSX page (.eco.tsx)', async () => {
			await (await setupBrowser()).bundle(optionsFor(ENTRYPOINTS.ecopagesJsx));
		});
	});
}
