import type { BuildOptions } from '../build-adapter.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

/** Option preset of a server build request. */
export type ServerBuildProfile = 'server-entry' | 'route-module';

/**
 * Resolves shared Rolldown options for a server build preset.
 */
export function resolveBuildProfileOptions(
	profile: ServerBuildProfile,
	appConfig: EcoPagesAppConfig,
	overrides: Partial<BuildOptions> = {},
): Partial<BuildOptions> {
	const root = appConfig.rootDir;

	switch (profile) {
		case 'server-entry':
			return {
				root,
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				minify: false,
				externalPackages: true,
				reportPackagesOutsideRoot: true,
				...overrides,
			};
		case 'route-module':
			return {
				root,
				target: 'es2022',
				format: 'esm',
				sourcemap: 'none',
				minify: false,
				externalPackages: true,
				...overrides,
			};
	}
}
