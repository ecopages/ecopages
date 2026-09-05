/**
 * Feed — `@ecopages/radiant-ui/feed`.
 *
 * `Feed` owns this component's stylesheet, so listing it in a page or layout
 * `dependencies.components` ships everything it needs.
 *
 * A `role="feed"` article has to announce its position: `aria-posinset` and
 * `aria-setsize` on every entry, counted against the whole list. Hand-written
 * feeds get those wrong the moment an entry is added or removed.
 *
 * Pass `articles` and the counting is done for you, along with the header /
 * content / actions scaffold each entry expects.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiFeed,
	RuiFeedArticle,
	RuiFeedArticleActions,
	RuiFeedArticleContent,
	RuiFeedArticleHeader,
	type RuiFeedProps,
} from '@ecopages/radiant-ui/feed';

export type FeedArticle = {
	/** Byline row, author block, timestamp — whatever heads the entry. */
	header?: JsxRenderable;
	content: JsxRenderable;
	/** Action row under the content. */
	actions?: JsxRenderable;
};

export type FeedProps = Omit<RuiFeedProps, 'children'> & {
	/** Entries in display order; positions are derived from this list. */
	articles?: FeedArticle[];
	children?: JsxRenderable;
};

export const Feed = eco.component<FeedProps, JsxRenderable>({
	dependencies: { stylesheets: ['./feed.css'] },
	render: ({ articles, children, ...props }) => (
		<RuiFeed {...props}>
			{articles
				? articles.map((article, index) => (
						<RuiFeedArticle posinset={index + 1} setsize={articles.length} tabindex={0}>
							{article.header ? <RuiFeedArticleHeader>{article.header}</RuiFeedArticleHeader> : null}
							<RuiFeedArticleContent>{article.content}</RuiFeedArticleContent>
							{article.actions ? <RuiFeedArticleActions>{article.actions}</RuiFeedArticleActions> : null}
						</RuiFeedArticle>
					))
				: children}
		</RuiFeed>
	),
});
