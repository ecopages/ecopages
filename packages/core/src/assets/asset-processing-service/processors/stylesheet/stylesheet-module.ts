import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';

/**
 * Compiles a stylesheet a module imports with a binding, as in `import styles from './card.css'`, into an ES module
 * whose default export is the processed CSS.
 *
 * @remarks
 * Every environment calls it, so a server build, a browser bundle and the dev transform server give the importer the
 * same string: the output of the app's stylesheet Processor (see {@link applyStylesheetProcessors}). A side-effect
 * import never reaches it, because its CSS reaches the Page as a Dependency. An error the Processor throws rejects.
 */
export async function compileStylesheetModule(appConfig: EcoPagesAppConfig, file: string): Promise<string> {
	return toStylesheetModule(await applyStylesheetProcessors(appConfig, await fileSystem.readFile(file), file));
}

/** The ES module a binding import of a stylesheet receives: `css` as its default export. */
export function toStylesheetModule(css: string): string {
	return `export default ${JSON.stringify(css)};\n`;
}
