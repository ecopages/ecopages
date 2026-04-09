import {
	getViteEnvironmentHostModuleLoader,
	resolveViteEnvironmentName,
} from '@ecopages/core/services/module-loading/vite-environment-host-module-loader.service';

export type HostModuleLoader = (id: string) => Promise<unknown>;

const NITRO_PREFERRED_ENVIRONMENT_NAMES = ['nitro', 'ssr'] as const;

export function resolveNitroViteEnvironmentName(environments?: Record<string, unknown>): string | undefined {
	return resolveViteEnvironmentName(environments, NITRO_PREFERRED_ENVIRONMENT_NAMES);
}

export function getNitroHostModuleLoader(): HostModuleLoader | undefined {
	return getViteEnvironmentHostModuleLoader({
		preferredEnvironmentNames: NITRO_PREFERRED_ENVIRONMENT_NAMES,
	});
}
