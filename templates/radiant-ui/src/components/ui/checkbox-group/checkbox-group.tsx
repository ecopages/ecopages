/**
 * CheckboxGroup — `@ecopages/radiant-ui/checkbox-group`.
 *
 * `CheckboxGroup` owns this component's stylesheet and lazy script, so listing
 * it in a page or layout `dependencies.components` ships everything it needs,
 * `Checkbox` chrome included.
 *
 * The primitive is already data-driven: `options` renders each checkbox and the
 * group's selection wiring. The JS property and `rui-change` detail are
 * `string[]`; JSX may still pass a string. Wrap it in `Field` for a visible
 * group label.
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
	RuiCheckboxGroupProps & {
		options?: RuiCheckboxOption[];
	}
>;

export const CheckboxGroup = eco.component<CheckboxGroupProps, JsxRenderable>({
	dependencies: {
		/** Borrowed chrome — see `src/components/ui/README.md`. */
		stylesheets: ['../checkbox/checkbox.css', './checkbox-group.css'],
		scripts: [{ src: './checkbox-group.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiCheckboxGroup,
});
