import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getDevToolbarPackageSpec } from './dev-toolbar-package.ts';

export type DevToolbarConfig = {
	/**
	 * Whether the in-browser dev toolbar is enabled during development.
	 *
	 * @default true when `package` is configured
	 */
	enabled?: boolean;
	/**
	 * Client package entry resolved from the application project.
	 *
	 * @remarks
	 * Install the package in the app (for example `@ecopages/dev-toolbar`) and
	 * point `package` at its browser bootstrap export. Core bundles that module
	 * to `/_dev_toolbar.js` during watch mode.
	 */
	package?: string;
};

/**
 * Returns whether the dev toolbar should be injected for the current process.
 */
export function isDevToolbarEnabled(
	appConfig: Pick<EcoPagesAppConfig, 'devToolbar'>,
	options: { watch: boolean; hostOwnsDevClient?: boolean },
): boolean {
	if (options.hostOwnsDevClient) {
		return false;
	}

	if (!options.watch) {
		return false;
	}

	if (process.env.ECOPAGES_DEV_TOOLBAR === 'false') {
		return false;
	}

	if (!getDevToolbarPackageSpec(appConfig)) {
		return false;
	}

	return appConfig.devToolbar?.enabled !== false;
}
