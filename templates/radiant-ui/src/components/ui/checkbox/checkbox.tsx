/**
 * Checkbox — `@ecopages/radiant-ui/checkbox`.
 *
 * `Checkbox` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * Children are the visible label, already associated with the input — `label`
 * is accepted as an alias for callers that pass their fields uniformly.
 *
 * A `description`, an `error` or a `name` routes it through `Field`, which is
 * what registers it with an ancestor `Form`.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiCheckbox, type RuiCheckboxElement, type RuiCheckboxProps } from '@ecopages/radiant-ui/checkbox';

export type CheckboxProps = JsxCustomElementAttributes<RuiCheckboxElement, RuiCheckboxProps>;

export const Checkbox = eco.component<CheckboxProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./checkbox.css'],
		scripts: [{ src: './checkbox.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiCheckbox,
});
