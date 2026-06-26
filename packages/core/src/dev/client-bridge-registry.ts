import type { EcoPagesAppConfig } from '../types/public-types.ts';
import type { IClientBridge } from '../types/public-types.ts';

const appDevClientBridges = new WeakMap<EcoPagesAppConfig, IClientBridge>();

export function setAppDevClientBridge(appConfig: EcoPagesAppConfig, bridge: IClientBridge): void {
	appDevClientBridges.set(appConfig, bridge);
}

export function getAppDevClientBridge(appConfig: EcoPagesAppConfig): IClientBridge | undefined {
	return appDevClientBridges.get(appConfig);
}

export function clearAppDevClientBridge(appConfig: EcoPagesAppConfig): void {
	appDevClientBridges.delete(appConfig);
}
