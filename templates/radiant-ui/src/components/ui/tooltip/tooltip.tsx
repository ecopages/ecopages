/**
 * Tooltip — `@ecopages/radiant-ui/tooltip`.
 *
 * `Tooltip` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * Whole on its own: the tip text goes in `content`, the focusable trigger in
 * `children`, and the host wires `aria-describedby` between them.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiTooltip, type RuiTooltipElement, type RuiTooltipProps } from '@ecopages/radiant-ui/tooltip';

export type TooltipProps = JsxCustomElementAttributes<RuiTooltipElement, RuiTooltipProps>;

export const Tooltip = eco.component<TooltipProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../primitives.css', './tooltip.css'],
		scripts: [{ src: './tooltip.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiTooltip,
});
