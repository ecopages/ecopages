import { appLogger } from '../../../global/app-logger.ts';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import {
	collectHtmlPageModuleScriptBuildInputs,
	scanModuleScript,
} from '../../../html-pages/html-page-module-scripts.ts';
import { FILE_ROLE_SUFFIXES } from '../../../utils/file-roles.ts';
import { findDeclaredScripts, scriptModuleLanguage } from '../../../build/rolldown/ssr-script-entries-plugin.ts';

const SCRIPT_SUFFIXES = FILE_ROLE_SUFFIXES.filter((suffix) => suffix.startsWith('.script.'));

/**
 * Lists the `.script` files under `srcDir` that nothing attaches to a page.
 *
 * @remarks
 * A script is attached when a literal `dependencies.scripts` entry in a module of the server build names it, an
 * HTML Page or the Html shell loads it with `<script src>`, or an attached script imports it. A module of the
 * server build that imports a script also counts, since that script is then part of the build. A `src` computed at
 * runtime is not found, and neither is a declaration in an MDX file, so such a script is listed here.
 *
 * @param serverModules Source files of the server build, whose declarations are read.
 */
export async function findUnattachedScripts(
	appConfig: EcoPagesAppConfig,
	serverModules: readonly string[],
): Promise<string[]> {
	const { srcDir } = appConfig.absolutePaths;
	const patterns = SCRIPT_SUFFIXES.map((suffix) => `**/*${suffix}`);
	const scripts = (await fileSystem.glob(patterns, { cwd: srcDir })).map((file) => path.resolve(srcDir, file));
	if (scripts.length === 0) return [];

	const attached = new Set<string>();
	const roots = new Set<string>();
	for (const file of serverModules) {
		attached.add(path.resolve(file));
		const lang = scriptModuleLanguage(file);
		if (!lang || !fileSystem.exists(file)) continue;
		const code = fileSystem.readFileSync(file).toString();
		if (!code.includes('scripts')) continue;
		for (const { src } of findDeclaredScripts(file, code, lang)) roots.add(path.resolve(path.dirname(file), src));
	}
	const html = collectHtmlPageModuleScriptBuildInputs(appConfig);
	for (const script of html.scripts) roots.add(path.resolve(script));
	for (const file of html.files) attached.add(path.resolve(file));

	for (const root of roots) {
		attached.add(root);
		for (const file of scanModuleScript(appConfig, root).files) attached.add(file);
	}
	return scripts.filter((script) => !attached.has(script)).sort();
}

/**
 * Warns once per `.script` file that {@link findUnattachedScripts} lists.
 */
export async function warnAboutUnattachedScripts(
	appConfig: EcoPagesAppConfig,
	serverModules: readonly string[],
): Promise<void> {
	for (const script of await findUnattachedScripts(appConfig, serverModules)) {
		appLogger.warn(
			`${path.relative(appConfig.rootDir, script)} is a browser script, but no dependencies.scripts entry or HTML <script src> attaches it, so it ships nowhere. Check the declaration's path, or delete the file.`,
		);
	}
}
