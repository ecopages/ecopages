import { glob } from 'node:fs/promises';
import path from 'node:path';
import type { EcoPagesAppConfig } from '../../packages/core/src/config/internal-types.ts';
import { loadEcoPagesConfig } from '../../packages/core/src/config/load-eco-config.ts';
import { emitProductionServerModules } from '../../packages/core/src/build/cache/pages-unified-graph-build.ts';
import { ENDPOINT_FILE_EXTENSIONS } from '../../packages/core/src/utils/endpoint-file-extensions.ts';

/**
 * Emits production server modules for a copied fixture so `NODE_ENV=production`
 * `createApp()` can import Pages without a spawned `ecopages build`.
 */
export async function emitCopiedFixtureServerModules(appDir: string): Promise<EcoPagesAppConfig> {
	const appConfig = await loadEcoPagesConfig({ configFile: path.join(appDir, 'eco.config.ts') });
	const pagesDir = appConfig.absolutePaths.pagesDir;
	const files: string[] = [];
	for await (const file of glob(
		[...appConfig.templatesExt, ...ENDPOINT_FILE_EXTENSIONS].map((extension) => `**/*${extension}`),
		{ cwd: pagesDir },
	)) {
		files.push(file);
	}
	await emitProductionServerModules({
		appConfig,
		router: {
			templateRoutes: files.map((file) => ({ filePath: path.join(pagesDir, file) })),
		},
	});
	return appConfig;
}
