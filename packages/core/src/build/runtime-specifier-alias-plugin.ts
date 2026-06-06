import type { EcoBuildPlugin } from './build-types.ts';
import { buildSpecifierFilter, toRuntimeSpecifierMap } from './browser-runtime-plugin-helpers.ts';

type RuntimeSpecifierMap = ReadonlyMap<string, string> | Record<string, string>;

/**
 * Creates a build plugin that aliases runtime bare specifiers to concrete URLs.
 *
 * @remarks
 * This helper is used when browser-target builds must preserve integration-owned
 * runtime specifier semantics while letting the bundler treat the mapped URLs as
 * external runtime assets.
 */
export function createRuntimeSpecifierAliasPlugin(
	specifierMapInput: RuntimeSpecifierMap,
	options?: {
		name?: string;
		external?: boolean;
	},
): EcoBuildPlugin | null {
	const specifierMap = toRuntimeSpecifierMap(specifierMapInput);
	const filter = buildSpecifierFilter(specifierMap);

	if (!filter) {
		return null;
	}

	return {
		name: options?.name ?? 'runtime-specifier-alias',
		setup(build) {
			build.onResolve({ filter }, (args) => {
				const mappedPath = specifierMap.get(args.path);
				if (!mappedPath) {
					return undefined;
				}

				return {
					path: mappedPath,
					external: options?.external ?? true,
				};
			});
		},
	};
}
