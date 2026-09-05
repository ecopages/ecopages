/**
 * InputGroup — `@ecopages/radiant-ui/input-group`.
 *
 * `InputGroup` owns this component's stylesheet, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * An input with something welded to its edge — a currency symbol, a protocol
 * prefix, a trailing icon button. The primitive needs an addon wrapper per
 * side, and a plain string addon needs a further text element to pick up the
 * muted styling.
 *
 * Pass `start` and `end`: strings get the text treatment, any other node is
 * placed as-is. The control itself stays in `children`.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiInputGroup,
	RuiInputGroupAddon,
	RuiInputGroupText,
	type RuiInputGroupProps,
} from '@ecopages/radiant-ui/input-group';

export type InputGroupProps = Omit<RuiInputGroupProps, 'children'> & {
	/** Leading addon. A string renders as muted text; anything else renders as-is. */
	start?: JsxRenderable;
	/** Trailing addon, same rules as `start`. */
	end?: JsxRenderable;
	/** The input or textarea. */
	children?: JsxRenderable;
};

function addon(content: JsxRenderable, align: 'start' | 'end') {
	return (
		<RuiInputGroupAddon align={align}>
			{typeof content === 'string' ? <RuiInputGroupText>{content}</RuiInputGroupText> : content}
		</RuiInputGroupAddon>
	);
}

export const InputGroup = eco.component<InputGroupProps, JsxRenderable>({
	dependencies: { stylesheets: ['./input-group.css'] },
	render: ({ start, end, children, ...props }) => (
		<RuiInputGroup {...props}>
			{start != null ? addon(start, 'start') : null}
			{children}
			{end != null ? addon(end, 'end') : null}
		</RuiInputGroup>
	),
});
