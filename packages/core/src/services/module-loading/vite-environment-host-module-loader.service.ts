import type { SourceModuleLoader } from './module-loading-types.ts';

type ViteEnvironmentImport = (environmentName: string, id: string) => Promise<unknown>;

type ViteEnvironmentGlobalScope = typeof globalThis & {
	__VITE_ENVIRONMENT_RUNNER_IMPORT__?: ViteEnvironmentImport;
	__nitro_vite_envs__?: Record<string, unknown>;
};

export type ViteEnvironmentHostModuleLoaderOptions = {
	preferredEnvironmentNames?: readonly string[];
};

const DEFAULT_PREFERRED_ENVIRONMENT_NAMES = ['nitro', 'ssr'] as const;

export function resolveViteEnvironmentName(
	environments?: Record<string, unknown>,
	preferredEnvironmentNames: readonly string[] = DEFAULT_PREFERRED_ENVIRONMENT_NAMES,
): string | undefined {
	if (!environments) {
		return undefined;
	}

	for (const environmentName of preferredEnvironmentNames) {
		if (environmentName in environments) {
			return environmentName;
		}
	}

	return Object.keys(environments)[0];
}

export function getViteEnvironmentHostModuleLoader(
	options: ViteEnvironmentHostModuleLoaderOptions = {},
): SourceModuleLoader | undefined {
	const globalScope = globalThis as ViteEnvironmentGlobalScope;
	const importWithRunner = globalScope.__VITE_ENVIRONMENT_RUNNER_IMPORT__;

	if (typeof importWithRunner !== 'function') {
		return undefined;
	}

	const environmentName = resolveViteEnvironmentName(
		globalScope.__nitro_vite_envs__,
		options.preferredEnvironmentNames,
	);

	if (!environmentName) {
		return undefined;
	}

	return async (id: string) => await importWithRunner(environmentName, id);
}
