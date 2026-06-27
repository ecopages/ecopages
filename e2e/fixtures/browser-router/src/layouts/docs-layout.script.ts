export class FixtureDocsSidebar extends HTMLElement {
	connectedCallback(): void {
		this.highlightActiveLink({ scrollToActiveLink: true });
	}

	highlightActiveLink(options?: { scrollToActiveLink?: boolean }): void {
		const links = this.querySelectorAll<HTMLAnchorElement>('[data-nav-link]');
		const currentPath = window.location.pathname;
		const shouldScroll = options?.scrollToActiveLink ?? false;

		for (const link of links) {
			const isActive = link.pathname === currentPath;
			link.classList.toggle('active', isActive);

			if (isActive && shouldScroll) {
				link.scrollIntoView({ block: 'nearest' });
			}
		}
	}
}

if (!customElements.get('fixture-docs-sidebar')) {
	customElements.define('fixture-docs-sidebar', FixtureDocsSidebar);
}

const refreshSidebarState = () => {
	document.querySelector<FixtureDocsSidebar>('fixture-docs-sidebar')?.highlightActiveLink();
};

document.addEventListener('eco:after-swap', refreshSidebarState);
document.addEventListener('eco:page-load', refreshSidebarState);

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'fixture-docs-sidebar': HtmlTag;
		}
	}
}
