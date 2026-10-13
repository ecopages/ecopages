/**
 * Toaster — `@ecopages/radiant-ui/toast`.
 *
 * `Toaster` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * Toasts are pushed, not rendered. The `toast()` API from
 * `@ecopages/radiant-ui/toast` does nothing until a `<rui-toaster>` is mounted
 * somewhere on the page, so the useful component here is the mount point, not
 * an individual toast — mount one `Toaster` in your layout and call `toast()`
 * from anywhere.
 *
 * Its script loads on idle rather than on a trigger: a toast fired early would
 * otherwise land before the host that displays it exists.
 *
 * `Toast` is the rare inline case — a notification already in the document at
 * render time, outside the stack.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiToast, RuiToaster, type RuiToastViewProps, type RuiToasterViewProps } from '@ecopages/radiant-ui/toast';

export type ToasterProps = RuiToasterViewProps;
export type ToastProps = RuiToastViewProps;

export const Toaster = eco.component<ToasterProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./toast.css'],
		scripts: [{ src: './toast.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ position = 'bottom-end', duration = 4000, visibleToasts = 3, closeButton = true, ...props }) => (
		<RuiToaster
			{...props}
			position={position}
			duration={duration}
			visibleToasts={visibleToasts}
			closeButton={closeButton}
		/>
	),
});

export const Toast = eco.component<ToastProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./toast.css'],
		scripts: [{ src: './toast.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiToast,
});
