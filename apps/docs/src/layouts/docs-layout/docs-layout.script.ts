/** Registers the Radiant UI custom elements rendered by the docs shell. */
import '@ecopages/radiant-ui/alert';
import '@ecopages/radiant-ui/breadcrumb';
import '@ecopages/radiant-ui/sidebar';
import '@ecopages/radiant-ui/toc';

const docsContentSelector = '.docs-layout__content';

type DocsNavigationEvent = CustomEvent<{ url: URL }>;

function scrollDocsToTop(): void {
	document.querySelector<HTMLElement>(docsContentSelector)?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

document.addEventListener('eco:after-swap', (event) => {
	const { url } = (event as DocsNavigationEvent).detail;
	if (url.hash) {
		return;
	}

	scrollDocsToTop();
});
