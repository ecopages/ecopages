import type { EcoBuildPlugin } from './build-types.ts';
import { attachRuntimeSpecifierAliasMap } from './runtime-specifier-aliases.ts';

type RuntimeSpecifierMap = ReadonlyMap<string, string> | Record<string, string>;

/**
 * Normalizes runtime specifier input into a read-only map shape.
 */
function toRuntimeSpecifierMap(specifierMap: RuntimeSpecifierMap): ReadonlyMap<string, string> {
	return specifierMap instanceof Map ? specifierMap : new Map(Object.entries(specifierMap));
}

/**
 * Escapes a literal specifier for inclusion in a regular expression.
 */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

	if (specifierMap.size === 0) {
		return null;
	}

	const filter = new RegExp(`^(${Array.from(specifierMap.keys()).map(escapeRegExp).join('|')})$`);

	return attachRuntimeSpecifierAliasMap(
		{
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
		},
		specifierMap,
	);
}
