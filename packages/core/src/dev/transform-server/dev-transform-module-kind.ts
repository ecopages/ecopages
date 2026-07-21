import path from 'node:path';

export type DevTransformModuleKind = 'script' | 'stylesheet';

/**
 * Classifies a dev-transform source path for materialization.
 */
export function resolveDevTransformModuleKind(sourcePath: string): DevTransformModuleKind {
	return path.extname(sourcePath) === '.css' ? 'stylesheet' : 'script';
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
