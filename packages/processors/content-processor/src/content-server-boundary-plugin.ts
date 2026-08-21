import type { EcoBuildPlugin } from '@ecopages/core/plugins/processor';
import { CONTENT_SERVER_VIRTUAL_MODULE_PATTERN } from './constants.ts';

/**
 * Rejects `ecopages:content/<collection>/server` in browser bundles.
 *
 * @remarks
 * Server modules lazy-load MDX entries via dynamic `import()` for `getComponent`. Browser builds
 * must never follow that graph; browser-safe MDX is available through `/browser` instead.
 */
export function createContentServerBoundaryPlugin(): EcoBuildPlugin {
	return {
		name: 'ecopages:content-server-boundary',
		setup(build) {
			build.onResolve({ filter: CONTENT_SERVER_VIRTUAL_MODULE_PATTERN }, (args) => {
				throw new Error(
					`[ecopages] Server-only content module '${args.path}' reached the browser bundle from ${args.importer || 'an entry point'}. Move this import into a server-only Page option.`,
				);
			});
		},
	};
}
