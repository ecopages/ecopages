/**
 * DateRangePicker — `@ecopages/radiant-ui/date-range-picker`.
 *
 * `DateRangePicker` owns this component's stylesheet and lazy script, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * With no children the host stamps both inputs, the separator, the toggle and
 * the two-month calendar popover. The nested calendar is registered from
 * `calendar.script.ts` on this host. It has no label of its own, so wrap it in
 * `Field` for one.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiDateRangePicker, type RuiDateRangePickerViewProps } from '@ecopages/radiant-ui/date-range-picker';

export type DateRangePickerProps = RuiDateRangePickerViewProps;

export const DateRangePicker = eco.component<DateRangePickerProps, JsxRenderable>({
	dependencies: {
		/** Borrowed chrome — see `src/components/ui/README.md`. */
		stylesheets: ['../primitives.css', '../calendar/calendar.css', './date-range-picker.css'],
		scripts: [
			{ src: './date-range-picker.script.ts', lazy: { 'on:visible': true } },
			{ src: '../calendar/calendar.script.ts', lazy: { 'on:visible': true } },
		],
	},
	render: RuiDateRangePicker,
});
