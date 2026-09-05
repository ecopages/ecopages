/**
 * Autocomplete — `@ecopages/radiant-ui/autocomplete`.
 *
 * `Autocomplete` owns this component's stylesheet and lazy script, so listing
 * it in a page or layout `dependencies.components` ships everything it needs.
 *
 * The host filters a collection as you type, but it only wraps children in a
 * root element — you supply the search input, the collection it filters, and
 * the message shown when nothing matches. Miss the empty state and a search
 * with no results looks broken.
 *
 * All three are stamped here. Put the thing being filtered — a `Listbox`, a
 * menu panel, a plain list — in `children`.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiAutocomplete,
	RuiAutocompleteCollection,
	RuiAutocompleteEmpty,
	RuiAutocompleteInput,
	type RuiAutocompleteElement,
	type RuiAutocompleteProps,
} from '@ecopages/radiant-ui/autocomplete';

export type AutocompleteProps = JsxCustomElementAttributes<RuiAutocompleteElement, RuiAutocompleteProps> & {
	/** Search field placeholder. */
	placeholder?: string;
	/** Shown when the filter matches nothing. */
	emptyMessage?: JsxRenderable;
	/** The collection being filtered. */
	children?: JsxRenderable;
};

export const Autocomplete = eco.component<AutocompleteProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../primitives.css', './autocomplete.css'],
		scripts: [{ src: './autocomplete.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ placeholder = 'Search…', emptyMessage = 'No results', children, ...props }) => (
		<RuiAutocomplete {...props}>
			<RuiAutocompleteInput placeholder={placeholder} />
			<RuiAutocompleteCollection>{children}</RuiAutocompleteCollection>
			<RuiAutocompleteEmpty>{emptyMessage}</RuiAutocompleteEmpty>
		</RuiAutocomplete>
	),
});
