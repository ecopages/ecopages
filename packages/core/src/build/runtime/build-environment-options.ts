import type { BuildEnvironment, BuildOptions, BuildTranspileOptions } from '../contracts/build-contracts.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

export function resolveTranspileOptions(environment: BuildEnvironment): BuildTranspileOptions {
	return {
		target: environment === 'browser' ? 'browser' : 'node',
		format: 'esm',
		sourcemap: 'none',
	};
}

export function resolveBuildEnvironmentOptions(
	environment: BuildEnvironment,
	appConfig: EcoPagesAppConfig,
): Omit<BuildOptions, 'entrypoints'> {
	return {
		environment,
		root: appConfig.rootDir,
		...resolveTranspileOptions(environment),
		minify: false,
		...(environment === 'server' ? { externalPackages: true } : {}),
	};
}
