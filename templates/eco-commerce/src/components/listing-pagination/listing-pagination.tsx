import type { JsxRenderable } from '@ecopages/jsx';
import { RuiPagination } from '@ecopages/radiant-ui/pagination';
import './listing-pagination.css';

export type ListingPaginationProps = {
	page: number;
	pageCount: number;
	/** The URL of a page; page 1 should be the listing's own URL. */
	href: (page: number) => string;
};

/**
 * The page links of a listing, or nothing when it has one page.
 *
 * @remarks
 * `RuiPagination` with `getHref` renders each page as an `<a href>`, so paging works without JavaScript, the browser
 * router prefetches the links and crawlers follow them.
 */
export function ListingPagination({ page, pageCount, href }: ListingPaginationProps): JsxRenderable {
	if (pageCount <= 1) return null;
	return <RuiPagination label="Pages" class="listing-pager" page={page} pageCount={pageCount} getHref={href} />;
}
