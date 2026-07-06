import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { state } from '@ecopages/radiant/decorators/state';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';

type PaginationLink = {
	href: string;
	title: string;
};

type ManifestData = {
	pages: Array<{
		href: string;
		title: string;
	}>;
};

function readManifestPages(): ManifestData['pages'] {
	const node = document.getElementById('docs-manifest-data');
	if (!node?.textContent) {
		return [];
	}

	try {
		const parsed = JSON.parse(node.textContent) as ManifestData;
		return parsed.pages ?? [];
	} catch {
		return [];
	}
}

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
		const pages = readManifestPages();
		const currentPath = window.location.pathname;
		const currentIndex = pages.findIndex((page) => page.href === currentPath);
		if (currentIndex === -1) {
			this.prevLink = null;
			this.nextLink = null;
			return;
		}

		const prevPage = currentIndex > 0 ? pages[currentIndex - 1] : null;
		const nextPage = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;
		this.prevLink = prevPage ? { href: prevPage.href, title: prevPage.title } : null;
		this.nextLink = nextPage ? { href: nextPage.href, title: nextPage.title } : null;
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

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'radiant-docs-pagination': JsxCustomElementAttributes<RadiantDocsPagination>;
	}
}
