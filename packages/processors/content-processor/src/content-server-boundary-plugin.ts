import type { EcoBuildPlugin } from '@ecopages/core/plugins/processor';
import { CONTENT_SERVER_VIRTUAL_MODULE_PATTERN } from './constants.ts';

/**
 * Keeps `ecopages:content/<collection>/server` out of browser bundles.
 *
 * @remarks
 * Server modules lazy-load MDX entries via dynamic `import()` for `getComponent`. Browser builds
 * must never follow that graph — highlighted MDX output belongs in SSR HTML only.
 */
export function createContentServerBoundaryPlugin(): EcoBuildPlugin {
	return {
		name: 'ecopages:content-server-boundary',
		setup(build) {
			build.onResolve({ filter: CONTENT_SERVER_VIRTUAL_MODULE_PATTERN }, (args) => ({
				path: args.path,
				external: true,
			}));
		},
	};
}
