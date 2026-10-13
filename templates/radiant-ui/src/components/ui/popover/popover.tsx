/**
 * Popover — `@ecopages/radiant-ui/popover`.
 *
 * `Popover` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * Three primitives have to nest in one order for a click-to-open popover:
 * `RuiPopoverTrigger` wraps `RuiPopover`, which wraps `RuiPopoverContent`. Skip
 * the trigger wrapper and the surface renders but never opens.
 *
 * Pass the control as `trigger` and the surface content as children.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiPopover,
	RuiPopoverContent,
	RuiPopoverTrigger,
	type RuiPopoverElement,
	type RuiPopoverProps,
} from '@ecopages/radiant-ui/popover';

export type PopoverProps = JsxCustomElementAttributes<RuiPopoverElement, RuiPopoverProps> & {
	/** The control that opens the surface. */
	trigger: JsxRenderable;
	/** Classes for the content wrapper inside the floating surface. */
	contentClass?: string;
	children?: JsxRenderable;
};

export const Popover = eco.component<PopoverProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../primitives.css', './popover.css'],
		scripts: [{ src: './popover.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ trigger, contentClass, children, placement = 'bottom-start', ...props }) => (
		<RuiPopoverTrigger trigger={trigger}>
			<RuiPopover {...props} placement={placement}>
				<RuiPopoverContent class={contentClass}>{children}</RuiPopoverContent>
			</RuiPopover>
		</RuiPopoverTrigger>
	),
});
