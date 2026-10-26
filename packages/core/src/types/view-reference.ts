/**
 * Brand on a view reference created from an import of an Integration-owned file.
 *
 * @remarks
 * Shared across the CLI preload, the server-entry plugin, and render-time
 * resolution so two imports of one file compare as the same object.
 */
export const VIEW_REFERENCE = Symbol.for('ecopages.view-reference');

/**
 * Handle for an Integration-owned view imported from the server entry.
 *
 * @remarks
 * Core resolves the file at render time: development through the app module
 * loader, production from the server-modules map. The identity fields match the
 * module so Integration ownership is available before that load.
 */
export interface ViewReference<P = Record<string, unknown>> {
	readonly [VIEW_REFERENCE]: true;
	readonly filePath: string;
	readonly config: {
		identity: {
			id: string;
			file: string;
			integration?: string;
		};
	};
	/** Phantom props parameter so `ctx.render(view, props)` stays typed. */
	readonly __props?: P;
}

/** True when `value` is a view reference, not a loaded component. */
export function isViewReference<P = Record<string, unknown>>(value: unknown): value is ViewReference<P> {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as ViewReference)[VIEW_REFERENCE] === true &&
		typeof (value as ViewReference).filePath === 'string'
	);
}
