import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';

/**
 * A specifier with a scheme, such as `ecopages:images` or `node:fs`, but not a Windows drive path.
 */
const SCHEME_SPECIFIER = /^[A-Za-z][\w+.-]+:/u;

/**
 * Marks dependency imports as external so Rolldown transpiles only the entry module.
 *
 * @remarks
 * A specifier with a scheme names a virtual module (the image map, a content collection) that
 * app plugins later in the list serve, so it is left to them and inlined into this single-file
 * transpile; externalizing it would emit an import the browser cannot load.
 */
export function createDevTransformExternalizeImportsPlugin(): EcoBuildPlugin {
	return {
		name: 'ecopages-dev-transform-externalize-imports',
		setup(build) {
			build.onResolve({ filter: /.*/u, exclude: SCHEME_SPECIFIER }, (args) => {
				if (!args.importer) {
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
