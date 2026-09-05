/**
 * DateField — `@ecopages/radiant-ui/date-field`.
 *
 * `DateField` owns this component's stylesheet and lazy script, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * With no children the host stamps the segmented input, the calendar toggle and
 * the popover. It renders no visible label — the package says to pair it with a
 * `Label` or a `Field` — so wrap it in `Field`.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiDateField, type RuiDateFieldElement, type RuiDateFieldProps } from '@ecopages/radiant-ui/date-field';

export type DateFieldProps = JsxCustomElementAttributes<RuiDateFieldElement, RuiDateFieldProps>;

export const DateField = eco.component<DateFieldProps, JsxRenderable>({
	dependencies: {
		/** Borrowed chrome — see `src/components/ui/README.md`. */
		stylesheets: ['../primitives.css', '../calendar/calendar.css', './date-field.css'],
		scripts: [{ src: './date-field.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiDateField,
});
