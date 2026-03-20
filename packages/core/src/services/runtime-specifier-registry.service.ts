import type { EcoPagesAppConfig } from '../internal-types.ts';

export interface RuntimeSpecifierRegistry {
	register(map: Record<string, string>): void;
	getAll(): Map<string, string>;
	clear(): void;
}

export class InMemoryRuntimeSpecifierRegistry implements RuntimeSpecifierRegistry {
	private readonly specifierMap = new Map<string, string>();

	register(map: Record<string, string>): void {
		for (const [specifier, url] of Object.entries(map)) {
			this.specifierMap.set(specifier, url);
		}
	}

	getAll(): Map<string, string> {
		return this.specifierMap;
	}

	clear(): void {
		this.specifierMap.clear();
	}
}

export function getAppRuntimeSpecifierRegistry(appConfig: EcoPagesAppConfig): RuntimeSpecifierRegistry {
	return appConfig.runtime?.runtimeSpecifierRegistry ?? new InMemoryRuntimeSpecifierRegistry();
}

export function setAppRuntimeSpecifierRegistry(
	appConfig: EcoPagesAppConfig,
	runtimeSpecifierRegistry: RuntimeSpecifierRegistry,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		runtimeSpecifierRegistry,
	};
}