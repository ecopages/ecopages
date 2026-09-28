import { readDevManifestFromDocument } from '../api/dev-manifest.ts';
import type { DevToolbarApp, DevToolbarBadge } from '../api/types.ts';

export type LegacyAppHostContext = {
	onBadgeChange: (appId: string, badge: DevToolbarBadge | undefined) => void;
	onRouteListener: (listener: () => void) => () => void;
};

/**
 * Mounts optional extension dock apps from `window.__ECO_DEV_TOOLBAR_APPS__`.
 *
 * @remarks Internal to `@ecopages/dev-toolbar`. Not a stable Ecopages platform API.
 * App authors extend the toolbar by replacing `devToolbar.package`, not this registry.
 */
export class DevToolbarLegacyAppHost {
	private readonly apps = new Map<string, DevToolbarApp>();

	registerFromWindow(): void {
		for (const factory of window.__ECO_DEV_TOOLBAR_APPS__ ?? []) {
			const app = factory();
			this.apps.set(app.id, app);
		}
	}

	listApps(): DevToolbarApp[] {
		return [...this.apps.values()];
	}

	mount(appId: string, mountTarget: HTMLElement, context: LegacyAppHostContext): (() => void) | undefined {
		const app = this.apps.get(appId);
		if (!app) {
			return undefined;
		}

		mountTarget.replaceChildren();
		const cleanup = app.mount({
			document,
			manifest: readDevManifestFromDocument(document),
			mountTarget,
			onBadgeChange: (badge) => {
				context.onBadgeChange(app.id, badge);
			},
			onRouteChange: context.onRouteListener,
		});

		return typeof cleanup === 'function' ? cleanup : undefined;
	}
}

declare global {
	interface Window {
		/** Reference-toolbar internal registry. Not a supported extension API for app authors. */
		__ECO_DEV_TOOLBAR_APPS__?: Array<() => DevToolbarApp>;
	}
}
