/**
 * Dates — Dates, ranges and the month grid.
 *
 * One entry per component, rendered with the props you would actually
 * reach for. Split by family so no single file owns the whole catalog.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ComponentDemo } from '@/components/blocks/component-demo';
import { Calendar } from '@/components/ui/calendar';
import { DateField } from '@/components/ui/date-field';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Field } from '@/components/ui/field';

export const DatesDemos = eco.component<{}, JsxRenderable>({
	dependencies: { components: [ComponentDemo, Calendar, DateField, DateRangePicker, Field] },
	render: () => (
		<>
			<ComponentDemo
				id="calendar"
				name="Calendar"
				summary="Renders the whole month grid from value, min and max. Script waits until it scrolls into view."
			>
				<Calendar value="2026-03-14" />
			</ComponentDemo>

			<ComponentDemo
				id="date-field"
				name="DateField"
				summary="Segmented input, toggle and calendar popover, all stamped by the host."
			>
				<Field name="start" label="Start date">
					<DateField value="2026-03-14" />
				</Field>
			</ComponentDemo>

			<ComponentDemo
				id="date-range-picker"
				name="DateRangePicker"
				summary="Both inputs, the separator and a two-month calendar popover."
			>
				<Field name="stay" label="Stay">
					<DateRangePicker value="2026-03-14/2026-03-20" />
				</Field>
			</ComponentDemo>
		</>
	),
});
