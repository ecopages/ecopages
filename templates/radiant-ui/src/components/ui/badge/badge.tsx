/**
 * Badge — `@ecopages/radiant-ui/badge`.
 *
 * `Badge` owns this component's stylesheet, so listing it in a page or layout
 * `dependencies.components` ships everything it needs.
 *
 * A static status pill — `variant` is the only knob, so there is nothing to
 * assemble.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiBadge, type RuiBadgeProps } from '@ecopages/radiant-ui/badge';

export type BadgeProps = RuiBadgeProps;

export const Badge = eco.component<BadgeProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./badge.css'],
	},
	render: RuiBadge,
});
