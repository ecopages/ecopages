import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { SearchIcon } from '@/lib/search/search-icon';
import './catalog-search-hero.css';
export type CatalogSearchHeroProps = {
	placeholder?: string;
	label?: string;
};

export const CatalogSearchHero = eco.component<CatalogSearchHeroProps, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './catalog-search-hero.script.ts', ssr: true }],
		stylesheets: ['./catalog-search-hero.css'],
	},
	render: ({ placeholder = 'Search the wiki…', label = 'Search the wiki' }) => {
		return (
			<catalog-search-hero class="catalog-search-hero">
				<button type="button" class="catalog-search-hero__button" aria-haspopup="dialog" aria-label={label}>
					<SearchIcon />
					<span class="catalog-search-hero__placeholder">{placeholder}</span>
					<kbd class="catalog-search-hero__shortcut">⌘K</kbd>
				</button>
			</catalog-search-hero>
		);
	},
});
