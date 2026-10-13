/**
 * Switch — `@ecopages/radiant-ui/switch`.
 *
 * `Switch` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * Children are the visible label — `label` is accepted as an alias for callers
 * that pass their fields uniformly. Use a switch for settings that apply
 * immediately, and `Checkbox` for values submitted with a form. Wrap it in
 * `Field` when it belongs in a `Form`.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiSwitch, type RuiSwitchElement, type RuiSwitchProps } from '@ecopages/radiant-ui/switch';

export type SwitchProps = JsxCustomElementAttributes<RuiSwitchElement, RuiSwitchProps>;

export const Switch = eco.component<SwitchProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./switch.css'],
		scripts: [{ src: './switch.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiSwitch,
});
