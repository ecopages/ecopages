/** Registers the Radiant UI custom elements rendered by the docs shell. */
import '@ecopages/radiant-ui/alert';
import '@ecopages/radiant-ui/breadcrumb';
import '@ecopages/radiant-ui/sidebar';
import '@ecopages/radiant-ui/toc';

/**
 * Replays the initial navigation lifecycle after the document has parsed.
 *
 * @remarks
 * The sidebar custom element can connect before its slotted links exist during
 * streaming HTML parsing. The normal router lifecycle only runs after SPA
 * navigations, so the initial replay lets Radiant synchronize active links too.
 */
function dispatchInitialPageLoad(): void {
	document.dispatchEvent(
		new CustomEvent('eco:page-load', {
			detail: { url: new URL(window.location.href), direction: 'replace' },
		}),
	);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', dispatchInitialPageLoad, { once: true });
} else {
	requestAnimationFrame(dispatchInitialPageLoad);
}
