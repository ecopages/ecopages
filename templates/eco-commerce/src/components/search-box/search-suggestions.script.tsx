import type { JSX_PROPS, JsxRenderable } from '@ecopages/jsx';
import { RadiantElement, customElement, prop } from '@ecopages/radiant';
import { RuiListboxOption } from '@ecopages/radiant-ui/listbox';
import type { ProductJson } from '@/lib/storefront/json';

export type SearchSuggestionsProps = {
	results?: ProductJson[];
};

/**
 * `<search-suggestions>`: renders the typeahead's options inside the combobox listbox.
 *
 * @remarks
 * Each option's value is the product URL, which `<search-box>` opens when the visitor picks it. The thumbnails
 * use the product image URL, which warms the image the product page shows.
 */
@customElement('search-suggestions')
export class SearchSuggestionsElement extends RadiantElement {
	declare readonly [JSX_PROPS]?: SearchSuggestionsProps;

	@prop<ProductJson[]>({ type: Array, attribute: false })
	results: ProductJson[] = [];

	override render(): JsxRenderable {
		return (
			<>
				{this.results.map((result) => (
					<RuiListboxOption value={result.url} class="search-suggestions__option">
						<img src={result.thumbnail} alt="" width={36} height={36} decoding="async" />
						<span class="search-suggestions__name">{result.title}</span>
						<span class="search-suggestions__price">{result.price}</span>
					</RuiListboxOption>
				))}
			</>
		);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'search-suggestions': SearchSuggestionsElement;
	}
}
