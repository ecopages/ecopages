import { setHostModuleLoader } from '../services/module-loading/host-module-loader-registry.ts';

export type HostRuntimeModuleLoader = (id: string) => Promise<unknown>;

export interface DevelopmentHostRuntime {
	registerHostModuleLoader(loader: HostRuntimeModuleLoader): void;
}

export function createDevelopmentHostRuntime(): DevelopmentHostRuntime {
	return {
		registerHostModuleLoader(loader) {
			setHostModuleLoader(loader);
		},
	};
}
