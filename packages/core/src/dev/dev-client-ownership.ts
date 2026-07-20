import type { ApplicationRuntimeOptions } from '../adapters/abstract/application-adapter.ts';

/**
 * Returns whether the host dev server owns all browser dev-client bootstrap.
 *
 * When true, core must not inject the HMR runtime or signal full-page reloads.
 */
export function hostOwnsDevClient(runtime?: ApplicationRuntimeOptions): boolean {
	return runtime?.devClientOwner === 'host';
}
