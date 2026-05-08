import type { EcoPagesAppConfig } from '../types/public-types.ts';
import {
	DevelopmentInvalidationService,
	type DevelopmentInvalidationPlan,
} from '../services/invalidation/development-invalidation.service.ts';
import { setHostModuleLoader } from '../services/module-loading/host-module-loader-registry.ts';

export type HostRuntimeModuleLoader = (id: string) => Promise<unknown>;

export interface DevelopmentHostRuntime {
	registerHostModuleLoader(loader: HostRuntimeModuleLoader): void;
	planFileChange(filePath: string): DevelopmentInvalidationPlan;
	invalidateServerModules(changedFiles?: string[]): void;
	resetRuntimeState(changedFiles?: string[]): void;
}

export function createDevelopmentHostRuntime(appConfig: EcoPagesAppConfig): DevelopmentHostRuntime {
	const invalidationService = new DevelopmentInvalidationService(appConfig);

	return {
		registerHostModuleLoader(loader) {
			setHostModuleLoader(loader);
		},
		planFileChange(filePath) {
			return invalidationService.planFileChange(filePath);
		},
		invalidateServerModules(changedFiles) {
			invalidationService.invalidateServerModules(changedFiles);
		},
		resetRuntimeState(changedFiles) {
			invalidationService.resetRuntimeState(changedFiles);
		},
	};
}
