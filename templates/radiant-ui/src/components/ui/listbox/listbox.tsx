/**
 * Listbox — `@ecopages/radiant-ui/listbox`.
 *
 * `Listbox` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * The primitive is already data-driven: `options` gives every entry its role,
 * its selection indicator and its keyboard wiring. Pass `children` when an
 * option needs custom markup. Its own `label` is the accessible name — wrap it
 * in `Field` for a visible one.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiListbox,
	type RuiListboxElement,
	type RuiListboxOptionData,
	type RuiListboxProps,
} from '@ecopages/radiant-ui/listbox';

export type ListboxProps = JsxCustomElementAttributes<
	RuiListboxElement,
	RuiListboxProps & {
		options?: RuiListboxOptionData[];
	}
>;

export const Listbox = eco.component<ListboxProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./listbox.css'],
		scripts: [{ src: './listbox.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiListbox,
});
