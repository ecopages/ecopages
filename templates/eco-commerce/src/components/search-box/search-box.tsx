import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiCombobox, RuiComboboxControl, RuiComboboxInput, RuiComboboxListbox } from '@ecopages/radiant-ui/combobox';
import { RuiListbox } from '@ecopages/radiant-ui/listbox';
import './search-box.css';

export type SearchBoxProps = {
	query?: string;
};

/**
 * Header search: a plain `GET /search` form that `<search-box>` turns into a `RuiCombobox` typeahead.
 *
 * @remarks
 * The combobox input carries the native `name="q"`, so pressing Enter without JavaScript submits the form. The
 * scripts load on the first pointer or focus on the search, not with the page. `rui-combobox` keeps the text typed
 * before it upgrades, and `<search-box>` looks that text up once it connects.
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
			<form role="search" action="/search" method="get" data-ref="form">
				<RuiCombobox label="Search products" class="search-box__combobox" data-ref="combobox">
					<RuiComboboxControl>
						<RuiComboboxInput name="q" value={query} placeholder="Search products" />
					</RuiComboboxControl>
					<RuiComboboxListbox hidden>
						<RuiListbox embedded label="Matching products">
							<search-suggestions />
						</RuiListbox>
					</RuiComboboxListbox>
				</RuiCombobox>
			</form>
		</search-box>
	),
});
