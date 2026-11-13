import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { findAdjacentNavItems, type AdjacentNav } from '@/lib/docs/adjacent-nav';

export type DocsPaginationProps = {
	nav: AdjacentNav;
	currentHref?: string;
};

/**
 * Previous and next links for the current docs page, rendered on the server.
 *
 * @remarks
 * Every client navigation fetches and swaps the page region that contains this nav, so the links follow the
 * route without any client code.
 */
export const DocsPagination = eco.component<DocsPaginationProps, JsxRenderable>({
	render: ({ nav, currentHref }) => {
		const adjacent = currentHref ? findAdjacentNavItems(nav, currentHref) : null;
		if (!adjacent || (!adjacent.prev && !adjacent.next)) {
			return null;
		}

		return (
			<nav class="docs-layout__pagination" aria-label="Pagination">
				{adjacent.prev ? (
					<a href={adjacent.prev.href} class="group prev" rel="prev">
						<span class="pagination-label">Previous</span>
						<span class="pagination-title">{adjacent.prev.title}</span>
					</a>
				) : (
					<div></div>
				)}
				{adjacent.next ? (
					<a href={adjacent.next.href} class="group next" rel="next">
						<span class="pagination-label">Next</span>
						<span class="pagination-title">{adjacent.next.title}</span>
					</a>
				) : null}
			</nav>
		);
	},
});
