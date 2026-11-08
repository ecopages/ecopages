import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';

/** The module a binding import of a stylesheet compiles to, and the other stylesheets its CSS inlined. */
export interface CompiledStylesheetModule {
	code: string;
	dependencies: string[];
}

/**
 * Compiles a stylesheet a module imports with a binding, as in `import styles from './card.css'`, into an ES module
 * whose default export is the processed CSS, or, for a CSS Module such as `import styles from './card.module.css'`, the
 * class map.
 *
 * @remarks
 * Every environment calls it, so a server build, a browser bundle and the dev transform server give the importer the
 * same string: the output of the app's stylesheet Processor (see {@link applyStylesheetProcessors}). A side-effect
 * import never reaches it, because its CSS reaches the Page as a Dependency. An error the Processor throws rejects.
 *
 * A CSS Module compiles to its `exports` and not to its CSS, which reaches the Page as a Dependency. That CSS comes
 * from the same cached Processor result (see {@link applyStylesheetProcessors}), so the class names the module
 * exports are the ones the delivered stylesheet defines in every environment, from one transform per edit.
 * The dependencies let each caller rebuild the module when an `@import` partial changes.
 */
export async function compileStylesheetModule(
	appConfig: EcoPagesAppConfig,
	file: string,
): Promise<CompiledStylesheetModule> {
	const { css, dependencies, exports } = await applyStylesheetProcessors(
		appConfig,
		await fileSystem.readFile(file),
		file,
	);
	return { code: exports ? toClassMapModule(exports) : toStylesheetModule(css), dependencies };
}

/** The ES module a binding import of a stylesheet receives: `css` as its default export. */
export function toStylesheetModule(css: string): string {
	return `export default ${JSON.stringify(css)};\n`;
}

const RESERVED_WORDS = new Set(
	`arguments await break case catch class const continue debugger default delete do else enum eval export extends
	false finally for function if implements import in instanceof interface let new null package private protected
	public return static super switch this throw true try typeof var void while with yield`.split(/\s+/u),
);

/**
 * Whether a class name can be a named export of its CSS Module: a JavaScript identifier that is not a reserved word.
 *
 * @remarks
 * A name that fails stays on the default export, so `styles['is-active']` keeps working. Names are never renamed,
 * so `is-active` does not become `isActive`.
 */
export function isCssModuleExportName(name: string): boolean {
	return /^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u.test(name) && !RESERVED_WORDS.has(name);
}

/**
 * The ES module a binding import of a CSS Module receives: its class map as the default export, and each class
 * whose name is a valid identifier (see {@link isCssModuleExportName}) as a named export.
 */
export function toClassMapModule(exports: Readonly<Record<string, string>>): string {
	const named = Object.entries(exports)
		.filter(([name]) => isCssModuleExportName(name))
		.map(([name, scoped]) => `export const ${name} = ${JSON.stringify(scoped)};\n`);
	return `${named.join('')}export default ${JSON.stringify(exports)};\n`;
}
