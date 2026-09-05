/**
 * Avatar — `@ecopages/radiant-ui/avatar`.
 *
 * `Avatar` owns this component's stylesheet, so listing it in a page or layout
 * `dependencies.components` ships everything it needs.
 *
 * Whole on its own: `src` with an `alt`, or a `fallback` string for initials
 * when there is no image.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiAvatar, type RuiAvatarProps } from '@ecopages/radiant-ui/avatar';

export type AvatarProps = RuiAvatarProps;

export const Avatar = eco.component<AvatarProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./avatar.css'],
	},
	render: RuiAvatar,
});
