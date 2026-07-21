import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';

/**
 * Marks dependency imports as external so Rolldown transpiles only the entry module.
 *
 * @remarks
 * The Rolldown plugin bridge splits specifiers such as `ecopages:images` into
 * `namespace` + `path` before `onResolve`. Returning `external: true` for those
 * would emit a bare `from "images"` import and skip virtual-module `onLoad`.
 * Namespaced imports are left for app plugins (image map, etc.) to inline into
 * this single-file transpile.
 */
export function createDevTransformExternalizeImportsPlugin(): EcoBuildPlugin {
	return {
		name: 'ecopages-dev-transform-externalize-imports',
		setup(build) {
			build.onResolve({ filter: /.*/u }, (args) => {
				if (!args.importer) {
					return undefined;
				}

				if (args.namespace) {
					return undefined;
				}

				return {
					path: args.path,
					external: true,
				};
			});
		},
	};
}
