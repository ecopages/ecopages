import type { EcoBuildPlugin } from './build-types.ts';

type RuntimeSpecifierMap = ReadonlyMap<string, string> | Record<string, string>;

function toRuntimeSpecifierMap(specifierMap: RuntimeSpecifierMap): ReadonlyMap<string, string> {
	return specifierMap instanceof Map ? specifierMap : new Map(Object.entries(specifierMap));
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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