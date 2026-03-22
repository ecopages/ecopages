import type { EcoPagesAppConfig } from '../../internal-types.ts';

/**
 * Stores runtime-visible bare-specifier mappings for one app instance.
 *
 * @remarks
 * Integrations populate this registry during runtime setup when they expose
 * browser runtime modules through stable bare imports. Build and HMR code later
 * consume the collected map to create aliasing and bootstrap behavior without
 * forcing integrations to own global registry state.
 */
export interface RuntimeSpecifierRegistry {
	/**
	 * Merges a new batch of specifier mappings into the registry.
	 *
	 * @remarks
	 * Later registrations replace earlier URLs for the same specifier. This keeps
	 * runtime setup deterministic while still allowing an integration to refresh
	 * its own declarations during one app session.
	 */
	register(map: Record<string, string>): void;

	/**
	 * Returns the current registry contents.
	 *
	 * @remarks
	 * The returned map is the live backing map for the registry implementation, so
	 * callers should treat it as read-only unless they intentionally own registry
	 * mutation semantics.
	 */
	getAll(): Map<string, string>;

	/**
	 * Removes all registered specifiers for the current app/runtime instance.
	 */
	clear(): void;
}

/**
 * Default in-memory runtime specifier registry used by core.
 *
 * @remarks
 * Runtime specifier maps are app-local bootstrap metadata, not durable build
 * artifacts, so the default implementation stays intentionally small.
 */
export class InMemoryRuntimeSpecifierRegistry implements RuntimeSpecifierRegistry {
	private readonly specifierMap = new Map<string, string>();

	/**
	 * Merges one integration-provided mapping set into the app registry.
	 */
	register(map: Record<string, string>): void {
		for (const [specifier, url] of Object.entries(map)) {
			this.specifierMap.set(specifier, url);
		}
	}

	/**
	 * Returns the live app-owned mapping table.
	 */
	getAll(): Map<string, string> {
		return this.specifierMap;
	}

	/**
	 * Clears all mappings for the current runtime session.
	 */
	clear(): void {
		this.specifierMap.clear();
	}
}

/**
 * Returns the runtime specifier registry owned by one app instance.
 *
 * @remarks
 * Older tests and helpers may not seed runtime state explicitly yet, so this
 * helper still provides an in-memory fallback when the app runtime has not been
 * initialized.
 */
export function getAppRuntimeSpecifierRegistry(appConfig: EcoPagesAppConfig): RuntimeSpecifierRegistry {
	return appConfig.runtime?.runtimeSpecifierRegistry ?? new InMemoryRuntimeSpecifierRegistry();
}

/**
 * Installs the runtime specifier registry that should back one app instance.
 */
export function setAppRuntimeSpecifierRegistry(
	appConfig: EcoPagesAppConfig,
	runtimeSpecifierRegistry: RuntimeSpecifierRegistry,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		runtimeSpecifierRegistry,
	};
}
