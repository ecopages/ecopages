import type { DevToolbarConfig } from './dev-toolbar-config.ts';

export type DefineDevToolOptions = {
	/**
	 * Client package resolved from the application project.
	 *
	 * @example '@ecopages/dev-toolbar'
	 */
	package: string;
	/** @default true */
	enabled?: boolean;
};

/**
 * Builds a `devToolbar` config block for bring-your-own client packages.
 *
 * @remarks
 * Prefer importing `devToolbar` from `@ecopages/dev-toolbar/config` for the
 * official toolbar. Keep server config limited to package resolution and
 * enablement; UI preferences stay in the client package.
 */
export function defineDevTool(packageName: string): DevToolbarConfig;
export function defineDevTool(options: DefineDevToolOptions): DevToolbarConfig;
export function defineDevTool(packageNameOrOptions: string | DefineDevToolOptions): DevToolbarConfig {
	if (typeof packageNameOrOptions === 'string') {
		return { package: packageNameOrOptions };
	}

	return {
		package: packageNameOrOptions.package,
		...(packageNameOrOptions.enabled === undefined ? {} : { enabled: packageNameOrOptions.enabled }),
	};
}
