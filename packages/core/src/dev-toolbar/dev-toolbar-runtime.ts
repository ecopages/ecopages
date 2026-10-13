import type { DevClientRuntime } from '../hmr/dev-client-runtime.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { resolveInternalWorkDir } from '../utils/resolve-work-dir.ts';
import { resolveConfiguredDevToolbarClient } from './dev-toolbar-package.ts';
import { DEV_TOOLBAR_RUNTIME_SCRIPT_URL, resolveDevToolbarRuntimeWorkDir } from './dev-toolbar-runtime-paths.ts';

/**
 * Describes the browser runtime built from the configured Dev Toolbar package.
 *
 * @remarks
 * A package that is not installed or does not bundle is logged and leaves the page without a toolbar. It does
 * not disable HMR, which the page needs whether or not the toolbar loads.
 */
export function createDevToolbarClientRuntime(appConfig: EcoPagesAppConfig): DevClientRuntime {
	return {
		name: 'DevToolbar',
		url: DEV_TOOLBAR_RUNTIME_SCRIPT_URL,
		workDir: resolveDevToolbarRuntimeWorkDir(resolveInternalWorkDir(appConfig)),
		resolveEntry: () => {
			const client = resolveConfiguredDevToolbarClient(appConfig);
			if (!client) {
				throw new Error(
					'[DevToolbar] No client package configured. Set devToolbar.package in your app config.',
				);
			}
			return client.entryPath;
		},
		onFailure: (error) => appLogger.error('[DevToolbar] Could not bundle the Dev Toolbar runtime:', error),
	};
}
