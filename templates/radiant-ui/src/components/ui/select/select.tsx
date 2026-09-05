/**
 * Select — `@ecopages/radiant-ui/select`.
 *
 * `Select` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs — the
 * listbox and tag-group chrome it borrows come with it.
 *
 * Handed only `options`, the primitive assembles a plain select: trigger, value
 * display, embedded listbox, and tag chips when `selectionMode` is `multiple`.
 * The two things people reach for next — a clear button and a search field —
 * are not props; each requires hand-assembling the seven-part tree the stories
 * show, and getting one part wrong silently drops the behaviour.
 *
 * So `clearable` and `searchable` are props here, and the tree is built to
 * match. Its own `label` is the accessible name — wrap it in `Field` for a
 * visible one.
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
	/** Adds a search field above the options. */
	searchable?: boolean;
	searchPlaceholder?: string;
	/** Shown when the search matches nothing. */
	emptyMessage?: JsxRenderable;
};

/** What the closed trigger shows: the selected labels, or the placeholder. */
function displayText(options: RuiSelectOptionData[], value: string | string[] | undefined, placeholder?: string) {
	const selected = (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
	if (selected.length === 0) return placeholder ?? '';

	return options
		.filter((option) => selected.includes(option.value))
		.map((option) => option.label)
		.join(', ');
}

export const Select = eco.component<SelectProps, JsxRenderable>({
	dependencies: {
		/** Borrowed chrome — see `src/components/ui/README.md`. */
		stylesheets: [
			'../primitives.css',
			'../autocomplete/autocomplete.css',
			'../listbox/listbox.css',
			'../tag-group/tag-group.css',
			'./select.css',
		],
		/** `searchable` renders an autocomplete the select script does not bundle. */
		scripts: [
			{ src: './select.script.ts', lazy: { 'on:idle': true } },
			{ src: '../autocomplete/autocomplete.script.ts', lazy: { 'on:idle': true } },
		],
	},
	render: ({
		clearable,
		searchable,
		searchPlaceholder = 'Search…',
		emptyMessage = 'No results',
		options,
		value,
		placeholder,
		...props
	}) => {
		/** Nothing extra requested — let the primitive build its own tree. */
		if (!clearable && !searchable) {
			return <RuiSelect {...props} options={options} value={value} placeholder={placeholder} />;
		}

		const entries = options ?? [];
		const selected = (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
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
	},
});
