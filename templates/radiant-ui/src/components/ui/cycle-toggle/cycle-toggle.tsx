/**
 * CycleToggle — `@ecopages/radiant-ui/cycle-toggle`.
 *
 * `CycleToggle` owns this component's stylesheet and lazy script, so listing it
 * in a page or layout `dependencies.components` ships everything it needs.
 *
 * One button that steps through a fixed set of states — the theme control in
 * `src/components/theme-toggle.tsx` is built on it. The host wraps `children`
 * in its own button, so children are the `RuiCycleToggleItem`s themselves.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiCycleToggle,
	type RuiCycleToggleElement,
	type RuiCycleToggleProps,
} from '@ecopages/radiant-ui/cycle-toggle';
import { Button } from '../button';

export type CycleToggleProps = JsxCustomElementAttributes<RuiCycleToggleElement, RuiCycleToggleProps>;

export const CycleToggle = eco.component<CycleToggleProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./cycle-toggle.css'],
		scripts: [{ src: './cycle-toggle.script.ts', lazy: { 'on:idle': true } }],
		components: [Button],
	},
	render: RuiCycleToggle,
});
