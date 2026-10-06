import type { ApplicationRuntimeOptions } from '../adapters/abstract/application-adapter.ts';

/**
 * Returns whether the host dev server injects the browser dev client.
 *
 * @remarks
 * When true, core does not inject the HMR runtime into HTML, but still sends reloads and HMR events
 * through the client bridge on `/_hmr`, which the host's browser client must listen to.
 */
export function hostOwnsDevClient(runtime?: ApplicationRuntimeOptions): boolean {
	return runtime?.devClientOwner === 'host';
}
