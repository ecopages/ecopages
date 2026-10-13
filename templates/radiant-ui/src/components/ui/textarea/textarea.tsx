/**
 * Textarea — `@ecopages/radiant-ui/textarea`.
 *
 * `Textarea` owns this component's stylesheet, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * A single styled `<textarea>`; wrap it in `Field` for a label, hint and error.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiTextarea, type RuiTextareaProps } from '@ecopages/radiant-ui/textarea';

export type TextareaProps = RuiTextareaProps;

export const Textarea = eco.component<TextareaProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./textarea.css'],
	},
	render: RuiTextarea,
});
