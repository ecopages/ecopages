import { RadiantElement, state } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';

type PaginationLink = {
	href: string;
	title: string;
};

@customElement('radiant-docs-pagination')
export class RadiantDocsPagination extends RadiantElement {
	@state prevLink: PaginationLink | null = null;
	@state nextLink: PaginationLink | null = null;

	override connectedCallback(): void {
		super.connectedCallback();
		this.renderPagination();
	}

	@onEvent({ document: true, type: 'eco:page-load' })
	onPageLoad(): void {
		this.renderPagination();
	}

	@onEvent({ document: true, type: 'eco:after-swap' })
	onAfterSwap(): void {
		this.renderPagination();
	}

	renderPagination(): void {
		const nav = document.querySelector('radiant-navigation');
		if (!nav) {
			this.prevLink = null;
			this.nextLink = null;
			return;
		}

		const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));
		const currentPath = window.location.pathname;
		const currentIndex = links.findIndex((link) => link.pathname === currentPath);
		if (currentIndex === -1) {
			this.prevLink = null;
			this.nextLink = null;
			return;
		}

		const prevLink = currentIndex > 0 ? links[currentIndex - 1] : null;
		const nextLink = currentIndex < links.length - 1 ? links[currentIndex + 1] : null;
		this.prevLink = prevLink ? { href: prevLink.pathname, title: prevLink.textContent?.trim() || '' } : null;
		this.nextLink = nextLink ? { href: nextLink.pathname, title: nextLink.textContent?.trim() || '' } : null;
	}

	override render() {
		if (!this.prevLink && !this.nextLink) {
			return null;
		}

		return (
			<>
				{this.prevLink ? (
					<a href={this.prevLink.href} class="group prev">
						<span class="pagination-label">Previous</span>
						<span class="pagination-title">{this.prevLink.title}</span>
					</a>
				) : (
					<div></div>
				)}
				{this.nextLink ? (
					<a href={this.nextLink.href} class="group next">
						<span class="pagination-label">Next</span>
						<span class="pagination-title">{this.nextLink.title}</span>
					</a>
				) : null}
			</>
		);
	}
}
