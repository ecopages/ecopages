import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { SearchTrigger } from './search-box.script';
import './search-box.css';

export type SearchBoxProps = {
	/** URL of a JSON array of search documents. Default: `/search-index.json`. */
	indexUrl?: string;
	placeholder?: string;
	/** Accessible name for the search input. */
	label?: string;
};

export const SearchBox = eco.component<SearchBoxProps, JsxRenderable>({
	dependencies: {
		scripts: ['./search-box.script.tsx'],
	},
	render: ({ indexUrl = '/search-index.json', placeholder = 'Search…', label = 'Search' }) => {
		return (
			<radiant-search-box class="search-box" index-url={indexUrl} placeholder={placeholder} label={label}>
				<SearchTrigger label={label} />
			</radiant-search-box>
		);
	},
});
