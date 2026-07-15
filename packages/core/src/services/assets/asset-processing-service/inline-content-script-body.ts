import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../../global/app-logger.ts';
import type { ContentScriptAsset } from './assets.types.ts';

/**
 * Resolves the script body to embed when a content script is marked inline.
 *
 * @remarks
 * `inline` means embed in HTML, not "use declaration source." When bundling has
 * already run, only the output file is valid browser script; `dep.content` may
 * still contain build-time import paths. Processor emission and cache
 * materialization must share this rule so they cannot drift.
 */
export function resolveInlineContentScriptBody(
	dep: Pick<ContentScriptAsset, 'inline' | 'bundle' | 'content'>,
	filepath: string,
): string | undefined {
	if (!dep.inline) {
		return undefined;
	}

	if (dep.bundle !== false && fileSystem.exists(filepath)) {
		return fileSystem.readFileSync(filepath);
	}

	if (dep.bundle !== false) {
		appLogger.warn(`Missing bundled inline script output at ${filepath}; falling back to declaration source.`);
	}

	return dep.content;
}
