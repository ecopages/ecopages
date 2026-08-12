/** Registers the Radiant UI custom elements rendered by the docs shell. */
import '@ecopages/radiant-ui/alert';
import '@ecopages/radiant-ui/breadcrumb';
import '@ecopages/radiant-ui/sidebar';
import '@ecopages/radiant-ui/toc';

const docsContentSelector = '.docs-layout__content';
const docsSidebarId = 'docs-sidebar';

type DocsNavigationEvent = CustomEvent<{ url: URL }>;
type SidebarMobileChangeEvent = CustomEvent<{ mobile: boolean }>;
type SidebarControl = HTMLElement & { setOpen(next: boolean): void };

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

document.addEventListener('rui-sidebar-mobile-change', (event) => {
	const sidebar = event.target;
	if (
		!(sidebar instanceof HTMLElement) ||
		sidebar.id !== docsSidebarId ||
		!(event as SidebarMobileChangeEvent).detail.mobile
	) {
		return;
	}

	(sidebar as SidebarControl).setOpen(false);
});
