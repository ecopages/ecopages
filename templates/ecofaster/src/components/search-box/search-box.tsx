import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiInput } from '@ecopages/radiant-ui/input';
import './search-box.css';

export type SearchBoxProps = {
	query?: string;
};

/**
 * Header search: a plain `GET /search` form that `<search-box>` turns into a typeahead.
 *
 * @remarks
 * Both scripts load on the first pointer or focus on the form, so a visitor who never searches downloads neither.
 */
export const SearchBox = eco.component<SearchBoxProps, JsxRenderable>({
	dependencies: {
		scripts: [
			{ src: './search-suggestions.script.tsx', lazy: { 'on:interaction': 'pointerenter,focusin' } },
			{ src: './search-box.script.ts', lazy: { 'on:interaction': 'pointerenter,focusin' } },
		],
	},
	render: ({ query = '' }) => (
		<search-box class="search-box">
			<form role="search" action="/search" method="get" class="search-box__form">
				<label class="sr-only" for="site-search">
					Search products
				</label>
				<RuiInput
					id="site-search"
					type="search"
					name="q"
					value={query}
					placeholder="Search products"
					autocomplete="off"
					data-ref="input"
				/>
				<search-suggestions class="search-box__suggestions" data-ref="suggestions" />
				<p class="sr-only" data-ref="announcer" role="status" />
			</form>
		</search-box>
	),
});
