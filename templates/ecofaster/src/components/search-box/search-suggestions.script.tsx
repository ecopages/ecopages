import type { JSX_PROPS, JsxRenderable } from '@ecopages/jsx';
import { RadiantElement, customElement, prop } from '@ecopages/radiant';
import type { SearchSuggestion } from '@/lib/catalog/search-suggestions';

/** What `<search-box>` hands the list: the query it answered and its rows. */
export type SearchSuggestionsPanel = {
	query: string;
	results: SearchSuggestion[];
};

export type SearchSuggestionsProps = {
	panel?: SearchSuggestionsPanel | null;
};

/**
 * `<search-suggestions>`: renders the typeahead rows `<search-box>` fetched.
 *
 * @remarks
 * Rows are plain links, so the browser router prefetches a product on hover or keyboard focus and opens it as a
 * client navigation. The thumbnails use the product image URL, which warms the image the product page shows.
 */
@customElement('search-suggestions')
export class SearchSuggestionsElement extends RadiantElement {
	declare readonly [JSX_PROPS]?: SearchSuggestionsProps;

	@prop<SearchSuggestionsPanel | null>({ type: Object, attribute: false })
	panel: SearchSuggestionsPanel | null = null;

	override render(): JsxRenderable {
		const panel = this.panel;
		if (!panel) return null;
		if (panel.results.length === 0) {
			return <p class="search-suggestions__empty">No products match “{panel.query}”.</p>;
		}
		return (
			<ul class="search-suggestions__list" aria-label={`Products matching ${panel.query}`}>
				{panel.results.map((result) => (
					<li>
						<a class="search-suggestions__item" href={result.href}>
							<img src={result.image} alt="" width={40} height={40} decoding="async" />
							<span class="search-suggestions__name">{result.name}</span>
							<span class="search-suggestions__price">{result.price}</span>
						</a>
					</li>
				))}
			</ul>
		);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'search-suggestions': SearchSuggestionsElement;
	}
}
