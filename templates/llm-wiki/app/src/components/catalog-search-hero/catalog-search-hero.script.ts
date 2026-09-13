import { RadiantElement, customElement, onEvent } from '@ecopages/radiant';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { OPEN_WIKI_SEARCH_EVENT } from '@/lib/search/open-search';

const CATALOG_SEARCH_HERO_TAG = 'catalog-search-hero';

@customElement(CATALOG_SEARCH_HERO_TAG)
export class CatalogSearchHeroElement extends RadiantElement {
	@onEvent({ selector: 'button', type: 'click' })
	onSearchClick(): void {
		window.dispatchEvent(new CustomEvent(OPEN_WIKI_SEARCH_EVENT));
	}
}

export type CatalogSearchHeroElementProps = {
	id?: string;
};

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'catalog-search-hero': JsxCustomElementAttributes<CatalogSearchHeroElement, CatalogSearchHeroElementProps>;
	}
}
