/** Registers the Radiant UI custom elements rendered by the docs shell. */
import '@ecopages/radiant-ui/alert';
import '@ecopages/radiant-ui/breadcrumb';
import '@ecopages/radiant-ui/sidebar';
import '@ecopages/radiant-ui/toc';

const DOCS_SIDEBAR_ID = 'docs-sidebar';
const DOCS_TOC_SELECTOR = '.docs-layout__toc';
const NAVIGATION_EVENTS = 'eco:page-load,eco:after-swap';

/**
 * Replays the initial navigation lifecycle after the document has parsed.
 *
 * @remarks
 * The sidebar custom element can connect before its slotted links exist during
 * streaming HTML parsing. The normal router lifecycle only runs after SPA
 * navigations, so the initial replay lets Radiant synchronize active links too.
 */
function dispatchInitialPageLoad(): void {
	document.getElementById(DOCS_SIDEBAR_ID)?.setAttribute('navigation-events', NAVIGATION_EVENTS);
	document.querySelector<HTMLElement>(DOCS_TOC_SELECTOR)?.setAttribute('navigation-events', NAVIGATION_EVENTS);
	document.dispatchEvent(
		new CustomEvent('eco:page-load', {
			detail: { url: new URL(window.location.href), direction: 'replace' },
		}),
	);
}

/**
 * Restricts navigation wiring to a browser document.
 *
 * @remarks Radiant's server renderer installs a light-DOM surface with a
 * document and window. It must not receive persistent navigation listeners.
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
