/**
 * Calendar — `@ecopages/radiant-ui/calendar`.
 *
 * `Calendar` owns this component's stylesheet and lazy script, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * The host renders the whole month grid itself from `value`, `min` and `max` —
 * there are no parts to compose. Wrap it in `Field` for a label and an error
 * slot. Its script waits for the calendar to scroll into view, since a month
 * grid is rarely the first thing on a page.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiCalendar, type RuiCalendarElement, type RuiCalendarProps } from '@ecopages/radiant-ui/calendar';

export type CalendarProps = JsxCustomElementAttributes<RuiCalendarElement, RuiCalendarProps>;

export const Calendar = eco.component<CalendarProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./calendar.css'],
		scripts: [{ src: './calendar.script.ts', lazy: { 'on:visible': true } }],
	},
	render: RuiCalendar,
});
