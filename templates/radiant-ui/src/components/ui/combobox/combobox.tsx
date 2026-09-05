/**
 * Combobox — `@ecopages/radiant-ui/combobox`.
 *
 * `Combobox` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs — the
 * listbox, tag-group and autocomplete chrome it borrows come with it.
 *
 * Handed only `options`, the primitive assembles the input, the toggle and the
 * filtered listbox. A clear button is not a prop: the stories build it by
 * hand-assembling the control row, and it is the first thing a real combobox
 * wants, so `clearable` is a prop here and the tree is built to match.
 *
 * The primitive renders no visible label, and the package is explicit that you
 * must not nest one inside it — wrap it in `Field` for that.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiCombobox,
	RuiComboboxClear,
	RuiComboboxControl,
	RuiComboboxInput,
	RuiComboboxListbox,
	RuiComboboxTrigger,
	type RuiComboboxElement,
	type RuiComboboxOptionData,
	type RuiComboboxProps,
} from '@ecopages/radiant-ui/combobox';
import { RuiListbox } from '@ecopages/radiant-ui/listbox';
import { RuiAutocomplete, RuiAutocompleteCollection, RuiAutocompleteEmpty } from '@ecopages/radiant-ui/autocomplete';

export type ComboboxProps = JsxCustomElementAttributes<
	RuiComboboxElement,
	Omit<RuiComboboxProps, 'value'> & {
		options?: RuiComboboxOptionData[];
		value?: string | string[];
	}
> & {
	/** Adds a control that clears the selection and the query. */
	clearable?: boolean;
	/** Shown when the query matches nothing. */
	emptyMessage?: JsxRenderable;
};

export const Combobox = eco.component<ComboboxProps, JsxRenderable>({
	dependencies: {
		/** Borrowed chrome — see `src/components/ui/README.md`. */
		stylesheets: [
			'../primitives.css',
			'../autocomplete/autocomplete.css',
			'../listbox/listbox.css',
			'../tag-group/tag-group.css',
			'./combobox.css',
		],
		scripts: [{ src: './combobox.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ clearable, emptyMessage = 'No results', options, value, placeholder, ...props }) => {
		if (!clearable) {
			return <RuiCombobox {...props} options={options} value={value} placeholder={placeholder} />;
		}

		return (
			<RuiCombobox {...props} value={value} placeholder={placeholder}>
				<RuiComboboxControl>
					<RuiComboboxInput placeholder={placeholder} disabled={props.disabled} />
					<RuiComboboxClear aria-label="Clear selection" />
					<RuiComboboxTrigger aria-label="Show suggestions" disabled={props.disabled} />
				</RuiComboboxControl>
				<RuiComboboxListbox>
					<RuiAutocomplete>
						<RuiAutocompleteCollection>
							<RuiListbox
								embedded
								options={options ?? []}
								selectionMode={props.selectionMode}
								value={value}
							/>
							<RuiAutocompleteEmpty>{emptyMessage}</RuiAutocompleteEmpty>
						</RuiAutocompleteCollection>
					</RuiAutocomplete>
				</RuiComboboxListbox>
			</RuiCombobox>
		);
	},
});
