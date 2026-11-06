import type { EcoComponent } from '../../../types/contracts.ts';
import { getComponentIdentity } from '../../../eco/component-identity.ts';

/**
 * Thrown when a Layout renders without rendering the page it wraps.
 *
 * @remarks
 * `eco.page({ layout })` types a layout with `LayoutProps`, but a function with fewer parameters is still
 * assignable, so layout composition checks that each tier rendered its `children`.
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
