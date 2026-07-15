import type { BuildOptions } from '../build-adapter.ts';
import type { BuildProfile } from './build-runtime.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

/**
 * Resolves shared Rolldown options for a build profile.
 */
export function resolveBuildProfileOptions(
	profile: BuildProfile,
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
		case 'browser-hmr':
			return {
				root,
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
				minify: false,
				...overrides,
			};
	}
}
