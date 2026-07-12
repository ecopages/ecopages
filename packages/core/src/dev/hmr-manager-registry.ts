/**
 * Per-app registry for the shared HMR manager used by host-owned dev clients.
 */
import type { EcoPagesAppConfig } from '../types/public-types.ts';
import type { IHmrManager } from '../types/public-types.ts';

const appHmrManagers = new WeakMap<EcoPagesAppConfig, IHmrManager>();

export function setAppHmrManager(appConfig: EcoPagesAppConfig, hmrManager: IHmrManager): void {
	appHmrManagers.set(appConfig, hmrManager);
}

export function getAppHmrManager(appConfig: EcoPagesAppConfig): IHmrManager | undefined {
	return appHmrManagers.get(appConfig);
}

export function clearAppHmrManager(appConfig: EcoPagesAppConfig): void {
	appHmrManagers.delete(appConfig);
}
