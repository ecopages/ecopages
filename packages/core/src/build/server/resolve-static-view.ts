import { getComponentIdentity } from '../../eco/component-identity.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { EcoPageComponent, ViewLoader } from '../../types/contracts.ts';
import { isViewReference, type ViewReference } from '../../types/view-reference.ts';
import { createViewLoaderFromFilePath } from './import-view-module.ts';

export type StaticViewInput<P = Record<string, unknown>> = ViewLoader<P> | ViewReference<P> | EcoPageComponent<P>;

const PATH_VIEW_REMOVED =
	'String and URL view paths are removed. Import the view and pass it to app.static(), ctx.render(), or the error-page helpers.';

/**
 * Turns an imported view, an inline `eco.page` component, or a loader into the
 * lazy loader `app.static` and error pages store.
 */
export function resolveStaticView<P>(appConfig: EcoPagesAppConfig, view: StaticViewInput<P>): ViewLoader<P> {
	if (typeof view === 'string' || view instanceof URL) {
		throw new Error(PATH_VIEW_REMOVED);
	}

	if (isViewReference(view)) {
		return createViewLoaderFromFilePath(appConfig, view.filePath);
	}

	if (typeof view === 'function' && 'config' in view && view.config) {
		const loader: ViewLoader<P> = async () => ({ default: view as EcoPageComponent<P> });
		const filePath = getComponentIdentity(view)?.file;
		if (filePath) {
			loader.filePath = filePath;
		}
		return loader;
	}

	if (typeof view === 'function') {
		return view as ViewLoader<P>;
	}

	throw new Error('app.static and error pages expect an imported view, an eco.page component, or a view loader.');
}
