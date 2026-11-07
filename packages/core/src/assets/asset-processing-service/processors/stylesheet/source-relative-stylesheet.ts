import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { RESOLVED_ASSETS_DIR } from '../../../../constants.ts';
import { assertBrowserOutputInsideDist, sourceRelativeBrowserAssetPath } from '../../../browser-asset-output.ts';
import { emitStylesheetReferences } from './package-stylesheet.ts';

/**
 * Writes a processed app stylesheet at its source-relative path under `dist/client/assets`, with the files its
 * relative `url()` references name emitted beside it, and returns that path; `undefined` for a file outside `srcDir`.
 *
 * @remarks
 * Development keeps a stylesheet inside `srcDir` at a stable href so CSS HMR can refresh the `<link>`. Core writes it
 * when a Page links it, and a CSS Processor rewrites it after an edit; both go through here so the output names the
 * same emitted files. An unchanged file is not rewritten.
 */
export function writeSourceRelativeStylesheet(
	appConfig: EcoPagesAppConfig,
	sourceFile: string,
	processedCss: string,
): string | undefined {
	const { distDir, srcDir } = appConfig.absolutePaths;
	const relativePath = sourceRelativeBrowserAssetPath(srcDir, sourceFile);
	if (!relativePath) return undefined;

	const assetsDir = path.join(distDir, RESOLVED_ASSETS_DIR);
	const filepath = path.join(assetsDir, relativePath);
	assertBrowserOutputInsideDist(distDir, filepath);
	const css = emitStylesheetReferences(processedCss, sourceFile, {
		assetsDir,
		toReference: (emitted) => path.relative(path.dirname(filepath), emitted),
	});
	if (fileSystem.exists(filepath) && fileSystem.readFileSync(filepath) === css) return filepath;
	fileSystem.ensureDir(path.dirname(filepath));
	fileSystem.write(filepath, css);
	return filepath;
}
