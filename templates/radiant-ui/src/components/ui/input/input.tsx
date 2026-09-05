/**
 * Input — `@ecopages/radiant-ui/input`.
 *
 * `Input` owns this component's stylesheet, so listing it in a page or layout
 * `dependencies.components` ships everything it needs.
 *
 * A single styled `<input>`; wrap it in `Field` for a label, hint and error, or
 * in `InputGroup` for prefixes and suffixes.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiInput, type RuiInputProps } from '@ecopages/radiant-ui/input';

export type InputProps = RuiInputProps;

export const Input = eco.component<InputProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./input.css'],
	},
	render: RuiInput,
});
