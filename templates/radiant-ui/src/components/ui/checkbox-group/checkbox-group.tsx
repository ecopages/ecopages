/**
 * CheckboxGroup — `@ecopages/radiant-ui/checkbox-group`.
 *
 * `CheckboxGroup` owns this component's stylesheet and lazy script, so listing
 * it in a page or layout `dependencies.components` ships everything it needs,
 * `Checkbox` chrome included.
 *
 * The primitive is already data-driven: `options` renders each checkbox and the
 * group's selection wiring. What it gets wrong is the type — its view intersects
 * the host's `value?: string` with the view's `value?: string | string[]`, which
 * collapses to a type nothing satisfies. This redeclares it and serializes an
 * array to the comma-separated protocol the host reads.
 *
 * Wrap it in `Field` for a visible group label.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiCheckboxGroup,
	type RuiCheckboxGroupElement,
	type RuiCheckboxGroupProps,
	type RuiCheckboxOption,
} from '@ecopages/radiant-ui/checkbox-group';

export type CheckboxGroupProps = JsxCustomElementAttributes<
	RuiCheckboxGroupElement,
	Omit<RuiCheckboxGroupProps, 'value'> & {
		options?: RuiCheckboxOption[];
		/** Checked values. A single string is accepted for a one-item group. */
		value?: string | string[];
	}
>;

export const CheckboxGroup = eco.component<CheckboxGroupProps, JsxRenderable>({
	dependencies: {
		/** Borrowed chrome — see `src/components/ui/README.md`. */
		stylesheets: ['../checkbox/checkbox.css', './checkbox-group.css'],
		scripts: [{ src: './checkbox-group.script.ts', lazy: { 'on:idle': true } }],
	},
	/**
	 * The host reads `value` as the comma-separated protocol it exposes on the
	 * element, so an array is joined here rather than handed over as an array the
	 * view's own type will not accept.
	 */
	render: ({ value, ...props }) => (
		<RuiCheckboxGroup {...props} value={Array.isArray(value) ? value.join(',') : value} />
	),
});
