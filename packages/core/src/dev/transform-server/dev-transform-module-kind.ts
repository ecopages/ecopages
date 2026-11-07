import { PLAIN_CSS_KINDS, type StylesheetKinds } from '../../plugins/stylesheet-kinds.ts';

export type DevTransformModuleKind = 'script' | 'stylesheet';

/**
 * Classifies a dev-transform source path for materialization.
 */
export function resolveDevTransformModuleKind(
	sourcePath: string,
	kinds: StylesheetKinds = PLAIN_CSS_KINDS,
): DevTransformModuleKind {
	return kinds.isStylesheet(sourcePath) ? 'stylesheet' : 'script';
}

/**
 * Emits browser ESM for a stylesheet import (`import styles from './x.css'`).
 *
 * @remarks
 * Parallels the server-side CSS shim: CSS stays in the module graph as a string
 * export while real stylesheet delivery uses `dependencies.stylesheets`.
 */
export function materializeDevTransformStylesheet(cssContent: string): string {
	return `export default ${JSON.stringify(cssContent)};\n`;
}
