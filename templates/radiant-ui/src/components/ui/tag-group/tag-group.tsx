/**
 * TagGroup — `@ecopages/radiant-ui/tag-group`.
 *
 * `TagGroup` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * Already data-driven: pass `tags` and each one gets its remove control and its
 * place in the group's keyboard model.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiTagGroup,
	type RuiTagData,
	type RuiTagGroupElement,
	type RuiTagGroupProps,
} from '@ecopages/radiant-ui/tag-group';

export type TagGroupProps = JsxCustomElementAttributes<RuiTagGroupElement, RuiTagGroupProps & { tags?: RuiTagData[] }>;

export const TagGroup = eco.component<TagGroupProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../primitives.css', './tag-group.css'],
		scripts: [{ src: './tag-group.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiTagGroup,
});
