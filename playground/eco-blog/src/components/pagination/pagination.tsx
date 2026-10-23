import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import './pagination.css';

/** Page 1 is the home page; later pages live under `/page/<n>`. */
export const pageHref = (page: number) => (page <= 1 ? '/' : `/page/${page}`);

/** Links to the newer and older page of posts; renders nothing when there is one page. */
export const Pagination = eco.component<{ page: number; pageCount: number }, JsxRenderable>({
	render: ({ page, pageCount }) =>
		pageCount <= 1 ? null : (
			<nav class="pagination breakout" aria-label="Pages of posts">
				{page > 1 ? (
					<RuiButton href={pageHref(page - 1)} variant="outline" rel="prev">
						Newer posts
					</RuiButton>
				) : (
					<span></span>
				)}
				<p class="pagination__status">
					Page {page} of {pageCount}
				</p>
				{page < pageCount ? (
					<RuiButton href={pageHref(page + 1)} variant="outline" rel="next">
						Older posts
					</RuiButton>
				) : (
					<span></span>
				)}
			</nav>
		),
});
