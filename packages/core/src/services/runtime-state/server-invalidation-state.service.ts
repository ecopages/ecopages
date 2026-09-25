import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

/**
 * App-owned coarse invalidation state for server-executed modules.
 */
export interface ServerInvalidationState {
	getServerInvalidationVersion(): number;
	invalidateServerModules(changedFiles?: string[]): void;
}

/**
 * Minimal app-local invalidation state backed by a single generation counter.
 */
export class CounterServerInvalidationState implements ServerInvalidationState {
	private serverInvalidationVersion = 0;

	getServerInvalidationVersion(): number {
		return this.serverInvalidationVersion;
	}

	invalidateServerModules(_changedFiles?: string[]): void {
		this.serverInvalidationVersion += 1;
	}
}

/**
 * Returns the app-owned server invalidation state.
 *
 * @remarks
 * When nothing is installed yet, a counter is installed on first read so later
 * reads share its version instead of each starting from zero.
 */
export function getAppServerInvalidationState(appConfig: EcoPagesAppConfig): ServerInvalidationState {
	if (appConfig.runtime?.serverInvalidationState) {
		return appConfig.runtime.serverInvalidationState;
	}

	const serverInvalidationState = new CounterServerInvalidationState();
	setAppServerInvalidationState(appConfig, serverInvalidationState);
	return serverInvalidationState;
}

/**
 * Installs the invalidation state used by one app instance.
 */
export function setAppServerInvalidationState(
	appConfig: EcoPagesAppConfig,
	serverInvalidationState: ServerInvalidationState,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		serverInvalidationState,
	};
}
