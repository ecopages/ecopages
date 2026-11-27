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
 * scripts load with the page rather than on first focus: `rui-combobox` rewrites its input when it upgrades, which
 * would drop what a visitor typed while the script was loading.
 */
export const SearchBox = eco.component<SearchBoxProps, JsxRenderable>({
	dependencies: {
		scripts: ['./search-suggestions.script.tsx', './search-box.script.ts'],
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
