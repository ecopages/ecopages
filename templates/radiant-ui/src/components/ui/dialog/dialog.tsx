/**
 * Dialog — `@ecopages/radiant-ui/dialog`.
 *
 * `Dialog` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * The primitive already accepts `title` and `actions`, so what this adds is the
 * part that is easy to get wrong: opening the thing. A dialog is driven by
 * document-level listeners watching for `[data-dialog-open="<id>"]`, which lets
 * the trigger live anywhere on the page — but only if you remember both the
 * attribute and the dialog's `id`.
 *
 * Pass `trigger` and both are wired for you. Call `openDialog(id)` from
 * `@ecopages/radiant-ui/dialog` when something other than a click opens it.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiDialog, type RuiDialogViewProps } from '@ecopages/radiant-ui/dialog';
import { Button } from '../button';

export type DialogProps = RuiDialogViewProps & {
	/** Rendered before the dialog and wired to open it. Requires `id`. */
	trigger?: JsxRenderable;
};

export const Dialog = eco.component<DialogProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./dialog.css'],
		scripts: [{ src: './dialog.script.ts', lazy: { 'on:idle': true } }],
		components: [Button],
	},
	render: ({ trigger, ...props }) =>
		trigger ? (
			<>
				<span data-dialog-open={props.id}>{trigger}</span>
				<RuiDialog {...props} />
			</>
		) : (
			<RuiDialog {...props} />
		),
});
