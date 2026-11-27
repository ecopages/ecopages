import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import './pager.css';

export type PagerProps = {
	page: number;
	pageCount: number;
	/** The URL of a page; page 1 should be the listing's own URL. */
	href: (page: number) => string;
};

/**
 * Previous, numbered and next links for a listing.
 *
 * @remarks
 * Plain links rather than `RuiPagination`, whose page controls are buttons: links work without JavaScript, the
 * browser router prefetches them, and crawlers follow them.
 */
export function Pager({ page, pageCount, href }: PagerProps): JsxRenderable {
	if (pageCount <= 1) return null;
	const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
	return (
		<nav class="pager" aria-label="Pages">
			{page > 1 ? (
				<RuiButton href={href(page - 1)} variant="outline" size="sm" rel="prev">
					Previous
				</RuiButton>
			) : null}
			{pages.map((number) => (
				<RuiButton
					href={href(number)}
					variant={number === page ? 'filled' : 'ghost'}
					size="sm"
					aria-current={number === page ? 'page' : undefined}
				>
					{number}
				</RuiButton>
			))}
			{page < pageCount ? (
				<RuiButton href={href(page + 1)} variant="outline" size="sm" rel="next">
					Next
				</RuiButton>
			) : null}
		</nav>
	);
}
