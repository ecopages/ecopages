/** Registers the Radiant UI custom elements rendered by the docs shell. */
import '@ecopages/radiant-ui/alert';
import '@ecopages/radiant-ui/breadcrumb';
import '@ecopages/radiant-ui/sidebar';
import '@ecopages/radiant-ui/toc';

/**
 * Connects the header trigger to the docs sidebar once the browser DOM exists.
 *
 * @remarks
 * Radiant UI resolves the `controls` property through `document` during
 * reactive updates. Leaving it unset in server-rendered markup avoids that
 * browser-only lookup during SSR; setting the attribute after DOM readiness
 * restores the same client-side toggle and accessibility behavior.
 */
function bindSidebarTriggers(): void {
	for (const trigger of document.querySelectorAll('rui-sidebar-trigger')) {
		trigger.setAttribute('controls', 'docs-sidebar');
	}
}

/**
 * Replays the initial navigation lifecycle after the document has parsed.
 *
 * @remarks
 * The sidebar custom element can connect before its slotted links exist during
 * streaming HTML parsing. The normal router lifecycle only runs after SPA
 * navigations, so the initial replay lets Radiant synchronize active links too.
 */
function dispatchInitialPageLoad(): void {
	bindSidebarTriggers();
	document.dispatchEvent(
		new CustomEvent('eco:page-load', {
			detail: { url: new URL(window.location.href), direction: 'replace' },
		}),
	);
}

/**
 * Identifies a browser document rather than the partial DOM surface installed
 * by Radiant while rendering custom elements on the server.
 */
function hasBrowserNavigationSurface(): boolean {
	return typeof window !== 'undefined' && typeof window.location?.href === 'string';
}

if (hasBrowserNavigationSurface()) {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', dispatchInitialPageLoad, { once: true });
	} else {
		requestAnimationFrame(dispatchInitialPageLoad);
	}
}
