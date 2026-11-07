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
