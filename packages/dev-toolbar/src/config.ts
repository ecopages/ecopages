const PACKAGE_NAME = '@ecopages/dev-toolbar' as const;

export type DevToolbarOptions = {
	/** @default true */
	enabled?: boolean;
};

export type DevToolbarConfig = {
	package: typeof PACKAGE_NAME;
	enabled?: boolean;
};

/**
 * Returns the `devToolbar` block for `defineConfig({ devToolbar })`.
 */
export function devToolbar(options?: DevToolbarOptions): DevToolbarConfig {
	return {
		package: PACKAGE_NAME,
		...(options?.enabled === undefined ? {} : { enabled: options.enabled }),
	};
}
