/**
 * HoverCard — `@ecopages/radiant-ui/hover-card`.
 *
 * `HoverCard` owns this component's stylesheet and lazy script, so listing it
 * in a page or layout `dependencies.components` ships everything it needs.
 *
 * Same shape as `Popover` but opened by hover or focus: the host expects a
 * `RuiHoverCardTrigger` and a `RuiHoverCardContent` as its two children, and
 * silently does nothing if either is missing.
 *
 * Pass the anchor as `trigger` and the card body as children.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiHoverCard,
	RuiHoverCardContent,
	RuiHoverCardTrigger,
	type RuiHoverCardElement,
	type RuiHoverCardProps,
} from '@ecopages/radiant-ui/hover-card';

export type HoverCardProps = JsxCustomElementAttributes<RuiHoverCardElement, RuiHoverCardProps> & {
	/** The element that reveals the card on hover or focus. */
	trigger: JsxRenderable;
	children?: JsxRenderable;
};

export const HoverCard = eco.component<HoverCardProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../primitives.css', './hover-card.css'],
		scripts: [{ src: './hover-card.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ trigger, children, placement = 'bottom-start', ...props }) => (
		<RuiHoverCard {...props} placement={placement}>
			<RuiHoverCardTrigger>{trigger}</RuiHoverCardTrigger>
			<RuiHoverCardContent>{children}</RuiHoverCardContent>
		</RuiHoverCard>
	),
});
