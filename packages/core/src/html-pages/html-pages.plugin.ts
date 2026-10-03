import path from 'node:path';
import { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcoPageFile } from '../types/public-types.ts';
import { HTML_PAGES_INTEGRATION_NAME, loadHtmlPageModule } from './html-page-module.ts';
import { HtmlPageRenderer } from './html-page-renderer.ts';

/**
 * Core-owned Integration for `.html` Filesystem Routes.
 *
 * @remarks
 * `finalizeEcoPagesConfig()` appends it after user Integrations unless one of them
 * already owns `.html`, so apps never register it themselves. HTML Pages have no
 * `staticPaths`, so they receive no Params.
 */
export class HtmlPagesPlugin extends IntegrationPlugin {
	renderer = HtmlPageRenderer;
	override readonly acceptsParams = false;

	constructor() {
		super({ name: HTML_PAGES_INTEGRATION_NAME, extensions: ['.html'] });
	}

	/**
	 * Compiles Pages under the pages directory and the `html.html` shell.
	 *
	 * @remarks
	 * Other `.html` files, such as an include other than the shell, are left to core.
	 */
	override compilePageModule(filePath: string, appConfig: EcoPagesAppConfig): EcoPageFile | undefined {
		const file = path.resolve(filePath);
		const { pagesDir, htmlTemplatePath } = appConfig.absolutePaths;
		if (!file.startsWith(`${pagesDir}${path.sep}`) && file !== htmlTemplatePath) {
			return undefined;
		}

		return loadHtmlPageModule(appConfig, file);
	}
}
