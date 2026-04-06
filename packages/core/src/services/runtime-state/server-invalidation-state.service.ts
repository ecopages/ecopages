import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { DevGraphService } from './dev-graph.service.ts';

/**
 * App-owned coarse invalidation state for server-executed modules.
 */
export interface ServerInvalidationState {
	getServerInvalidationVersion(): number;
	invalidateServerModules(changedFiles?: string[]): void;
	reset(): void;
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

	reset(): void {
		this.serverInvalidationVersion += 1;
	}
}

function isLegacyServerInvalidationState(value: unknown): value is DevGraphService {
	return (
		Boolean(value) &&
		typeof value === 'object' &&
		typeof (value as ServerInvalidationState).getServerInvalidationVersion === 'function' &&
		typeof (value as ServerInvalidationState).invalidateServerModules === 'function' &&
		typeof (value as ServerInvalidationState).reset === 'function'
	);
}

/**
 * Returns the app-owned server invalidation state.
 */
export function getAppServerInvalidationState(appConfig: EcoPagesAppConfig): ServerInvalidationState {
	if (appConfig.runtime?.serverInvalidationState) {
		return appConfig.runtime.serverInvalidationState;
	}

	if (isLegacyServerInvalidationState(appConfig.runtime?.devGraphService)) {
		return appConfig.runtime.devGraphService;
	}

	return new CounterServerInvalidationState();
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
