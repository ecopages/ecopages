import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';

/**
 * Creates an esbuild resolve plugin that externalizes integration runtime specifiers.
 *
 * @remarks
 * React HMR uses this so browser entrypoint bundles keep importing the shared
 * vendor runtime URLs instead of bundling a second React copy into the page.
 */
export function createRuntimeSpecifierAliasPlugin(specifierMap: ReadonlyMap<string, string>): EcoBuildPlugin | null {
	if (specifierMap.size === 0) {
		return null;
	}

	const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const filter = new RegExp(`^(${Array.from(specifierMap.keys()).map(escapeRegExp).join('|')})$`);

	return {
		name: 'react-hmr-runtime-specifier-alias',
		setup(build) {
			build.onResolve({ filter }, (args) => {
				const mappedPath = specifierMap.get(args.path);
				if (!mappedPath) {
					return undefined;
				}

				return {
					path: mappedPath,
					external: true,
				};
			});
		},
	};
}
