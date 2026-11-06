import type { BuildEnvironment, BuildOptions, BuildTranspileOptions } from '../contracts/build-contracts.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { getNodeEnvironment } from '../../env.ts';

export function resolveTranspileOptions(environment: BuildEnvironment): BuildTranspileOptions {
	return {
		target: environment === 'browser' ? 'browser' : 'node',
		format: 'esm',
		sourcemap: 'none',
	};
}

/**
 * Replaces `import.meta.env.NODE_ENV` and `process.env.NODE_ENV` with the current Node environment in browser code.
 *
 * @remarks
 * CommonJS packages such as React pick their development or production build from `process.env.NODE_ENV`. Defining it
 * for every browser build gives the app-wide build, route builds and the development vendor graph the same choice;
 * Rolldown would otherwise choose by `minify`.
 */
function createBrowserNodeEnvironmentDefines(): Record<string, string> {
	const nodeEnvironment = JSON.stringify(getNodeEnvironment() ?? 'development');
	return { 'import.meta.env.NODE_ENV': nodeEnvironment, 'process.env.NODE_ENV': nodeEnvironment };
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
		...(environment === 'browser' ? { define: createBrowserNodeEnvironmentDefines() } : {}),
		...(environment === 'server' ? { externalPackages: true } : {}),
	};
}
