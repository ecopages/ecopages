import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { RESOLVED_ASSETS_DIR } from '../../../../constants.ts';
import { assertBrowserOutputInsideDist, sourceRelativeBrowserAssetPath } from '../../../browser-asset-output.ts';
import { emitStylesheetReferences } from './package-stylesheet.ts';

/** The app folders {@link writeSourceRelativeStylesheet} reads from and writes to; `distDir` is the public output. */
export type SourceRelativeStylesheetDirs = { srcDir: string; distDir: string };

/**
 * Where {@link writeSourceRelativeStylesheet} writes `sourceFile`; `undefined` for a file outside `srcDir`.
 *
 * @remarks
 * A stylesheet with another extension, such as `card.scss` a Processor declares, is written as `card.scss.css`, so the
 * static server answers with a CSS MIME type and `card.css` beside it keeps its own file.
 */
function sourceRelativeStylesheetOutput(dirs: SourceRelativeStylesheetDirs, sourceFile: string): string | undefined {
	const relativePath = sourceRelativeBrowserAssetPath(dirs.srcDir, sourceFile);
	if (!relativePath) return undefined;
	return path.join(
		dirs.distDir,
		RESOLVED_ASSETS_DIR,
		path.extname(relativePath) === '.css' ? relativePath : `${relativePath}.css`,
	);
}

/**
 * The href a development Page links `sourceFile` at, which CSS HMR refreshes; `undefined` for a file outside `srcDir`,
 * which is written under a content hash instead.
 */
export function sourceRelativeStylesheetHref(
	dirs: SourceRelativeStylesheetDirs,
	sourceFile: string,
): string | undefined {
	const filepath = sourceRelativeStylesheetOutput(dirs, sourceFile);
	return filepath && `/${path.relative(dirs.distDir, filepath)}`;
}

/**
 * Writes a processed app stylesheet at its source-relative path under `<distDir>/assets`, with the files its
 * relative `url()` references name emitted beside it, and returns that path; `undefined` for a file outside `srcDir`.
 *
 * @remarks
 * Development keeps a stylesheet inside `srcDir` at a stable href so CSS HMR can refresh the `<link>`. Core writes it
 * when a Page links it, and its development stylesheet service rewrites it after an edit; both go through here so the
 * output names the same emitted files. An unchanged file is not rewritten.
 */
export function writeSourceRelativeStylesheet(
	dirs: SourceRelativeStylesheetDirs,
	sourceFile: string,
	processedCss: string,
): string | undefined {
	const filepath = sourceRelativeStylesheetOutput(dirs, sourceFile);
	if (!filepath) return undefined;

	const assetsDir = path.join(dirs.distDir, RESOLVED_ASSETS_DIR);
	assertBrowserOutputInsideDist(dirs.distDir, filepath);
	const css = emitStylesheetReferences(processedCss, sourceFile, {
		assetsDir,
		toReference: (emitted) => path.relative(path.dirname(filepath), emitted),
	});
	if (fileSystem.exists(filepath) && fileSystem.readFileSync(filepath) === css) return filepath;
	fileSystem.ensureDir(path.dirname(filepath));
	fileSystem.write(filepath, css);
	return filepath;
}
