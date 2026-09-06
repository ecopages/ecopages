/**
 * Select — `@ecopages/radiant-ui/select`.
 *
 * `Select` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs — the
 * listbox and tag-group chrome it borrows come with it.
 *
 * Handed only `options`, the primitive assembles a plain select: trigger, value
 * display, embedded listbox, and tag chips when `selectionMode` is `multiple`.
 * A clear button is not a prop on the primitive; `clearable` builds that tree
 * here.
 *
 * Its own `label` is the accessible name — wrap it in `Field` for a visible
 * one. For a search field above the options, use `SearchableSelect`. That
 * assembly needs the autocomplete script, so it is a separate module rather
 * than a render prop that would still ship the script when unused.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiSelect,
	RuiSelectClear,
	RuiSelectControl,
	RuiSelectListbox,
	RuiSelectSearch,
	RuiSelectToggle,
	RuiSelectTrigger,
	RuiSelectValue,
	type RuiSelectOptionData,
	type RuiSelectViewProps,
} from '@ecopages/radiant-ui/select';
import { RuiListbox } from '@ecopages/radiant-ui/listbox';
import { RuiTagGroup } from '@ecopages/radiant-ui/tag-group';
import { RuiAutocomplete, RuiAutocompleteCollection, RuiAutocompleteEmpty } from '@ecopages/radiant-ui/autocomplete';

export type SelectProps = RuiSelectViewProps & {
	/** Adds a control that clears the selection. */
	clearable?: boolean;
};

export type SearchableSelectProps = SelectProps & {
	searchPlaceholder?: string;
	/** Shown when the search matches nothing. */
	emptyMessage?: JsxRenderable;
};

type SelectAssemblyProps = SearchableSelectProps & {
	searchable?: boolean;
};

const selectChrome = {
	/** Borrowed chrome — see `src/components/ui/README.md`. */
	stylesheets: ['../primitives.css', '../listbox/listbox.css', '../tag-group/tag-group.css', './select.css'],
	scripts: [{ src: './select.script.ts', lazy: { 'on:idle': true as const } }],
};

/** What the closed trigger shows: the selected labels, or the placeholder. */
function displayText(
	options: RuiSelectOptionData[],
	value: string | readonly string[] | undefined,
	placeholder?: string,
) {
	const selected = (Array.isArray(value) ? [...value] : value ? [value] : []).filter(Boolean);
	if (selected.length === 0) return placeholder ?? '';

	return options
		.filter((option) => selected.includes(option.value))
		.map((option) => option.label)
		.join(', ');
}

/**
 * Shared tree for `Select` and `SearchableSelect`.
 *
 * @remarks
 * Two `eco.component` wrappers share this so autocomplete CSS and JS are
 * declared only on `SearchableSelect`. A `searchable` render prop on `Select`
 * cannot do that: `dependencies.scripts` is static.
 */
function SelectAssembly({
	clearable,
	searchable,
	searchPlaceholder = 'Search…',
	emptyMessage = 'No results',
	options,
	value,
	placeholder,
	...props
}: SelectAssemblyProps) {
	if (!clearable && !searchable) {
		return <RuiSelect {...props} options={options} value={value} placeholder={placeholder} />;
	}

	const entries = options ?? [];
	const selected = (Array.isArray(value) ? [...value] : value ? [value] : []).filter(Boolean);
	const listbox = <RuiListbox embedded options={entries} selectionMode={props.selectionMode} value={value} />;

	return (
		<RuiSelect {...props} value={value} placeholder={placeholder}>
			<RuiSelectControl>
				<RuiSelectTrigger disabled={props.disabled}>
					<RuiSelectValue>
						{props.selectionMode === 'multiple' ? (
							<RuiTagGroup
								label="Selected options"
								tags={entries.filter((option) => selected.includes(option.value))}
							/>
						) : (
							displayText(entries, value, placeholder)
						)}
					</RuiSelectValue>
				</RuiSelectTrigger>
				{clearable ? <RuiSelectClear aria-label="Clear selection" /> : null}
				<RuiSelectToggle />
			</RuiSelectControl>
			<RuiSelectListbox>
				{searchable ? (
					<RuiAutocomplete>
						<RuiSelectSearch aria-label="Search options" placeholder={searchPlaceholder} />
						<RuiAutocompleteCollection>
							{listbox}
							<RuiAutocompleteEmpty>{emptyMessage}</RuiAutocompleteEmpty>
						</RuiAutocompleteCollection>
					</RuiAutocomplete>
				) : (
					listbox
				)}
			</RuiSelectListbox>
		</RuiSelect>
	);
}

export const Select = eco.component<SelectProps, JsxRenderable>({
	dependencies: selectChrome,
	render: (props) => <SelectAssembly {...props} />,
});

/**
 * Select with a search field above the options.
 *
 * Same tree as a `clearable` `Select`, plus the autocomplete the select script
 * does not bundle. Listing this component is what ships that script.
 */
export const SearchableSelect = eco.component<SearchableSelectProps, JsxRenderable>({
	dependencies: {
		/** Borrowed chrome — see `src/components/ui/README.md`. */
		stylesheets: [
			'../primitives.css',
			'../autocomplete/autocomplete.css',
			'../listbox/listbox.css',
			'../tag-group/tag-group.css',
			'./select.css',
		],
		scripts: [
			{ src: './select.script.ts', lazy: { 'on:idle': true } },
			{ src: '../autocomplete/autocomplete.script.ts', lazy: { 'on:idle': true } },
		],
	},
	render: (props) => <SelectAssembly {...props} searchable />,
});
