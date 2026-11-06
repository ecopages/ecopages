import type { EcoComponent } from '../../../types/contracts.ts';
import { getComponentIdentity } from '../../../eco/component-identity.ts';
import { appLogger } from '../../../global/app-logger.ts';

/**
 * Reports a Layout that rendered without rendering the page it wraps.
 *
 * @remarks
 * `eco.page({ layout })` types a layout with `LayoutProps`, but a function with fewer parameters is still
 * assignable, so layout composition checks that each tier rendered its `children`. A
 * {@link LayoutChildrenNotRenderedHandler} decides whether the render throws it.
 */
export class LayoutChildrenNotRenderedError extends Error {
	override name = 'LayoutChildrenNotRenderedError';

	constructor(layoutName: string, file: string) {
		super(`[ecopages] Layout ${layoutName} (${file}) did not render its children`);
	}

	/**
	 * Names a layout for the error.
	 *
	 * @remarks
	 * An `eco.layout()` result is named after its file, since the factory's wrapper has no binding name. A plain
	 * function carries no file, so it is named by its function name and located by the page that uses it.
	 */
	static forLayout(layout: EcoComponent, page: EcoComponent): LayoutChildrenNotRenderedError {
		const layoutFile = getComponentIdentity(layout)?.file;
		if (layoutFile) {
			const fileName = layoutFile.split(/[\\/]/).pop() ?? layoutFile;
			return new LayoutChildrenNotRenderedError(fileName.replace(/\..*$/, ''), layoutFile);
		}

		const functionName = typeof layout === 'function' ? layout.name : '';
		const layoutName = (layout as { displayName?: string }).displayName || functionName || 'anonymous';
		return new LayoutChildrenNotRenderedError(layoutName, getComponentIdentity(page)?.file ?? 'unknown page');
	}
}

/** Receives a layout that rendered without its page; it throws, logs or ignores it by render mode. */
export type LayoutChildrenNotRenderedHandler = (error: LayoutChildrenNotRenderedError) => void;

/**
 * Chooses how a render reports a layout that dropped its children.
 *
 * @remarks
 * Static build output fails, so `ecopages build` stops. A development request-time render logs a warning and
 * returns the HTML, and a production request-time render returns it silently: a layout may render a sign-in
 * gate instead of the page on purpose, which must not turn into a 500 or one log line per request.
 */
export function createLayoutChildrenNotRenderedHandler(mode: {
	staticGeneration: boolean;
	production: boolean;
}): LayoutChildrenNotRenderedHandler {
	if (mode.staticGeneration) {
		return (error) => {
			throw error;
		};
	}
	if (mode.production) {
		return () => {};
	}
	return (error) => appLogger.warn(error.message);
}
