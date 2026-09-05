/**
 * Section — the shell every block sits in.
 *
 * Blocks are page-width bands: full-bleed background, content constrained to a
 * readable measure, consistent vertical rhythm between them. Repeating that
 * wrapper in each block is how the rhythm drifts, so it lives here once and
 * every block composes it.
 *
 * `width` is the inner measure, `spacing` the band's padding-block, and `inset`
 * the inline gutter. Set `spacing="none"` when a block paints its own edge;
 * set `inset="bleed"` when the inner content should reach the viewport edge.
 */
import { eco } from '@ecopages/core';
import type { JsxElementProps, JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';

export type SectionWidth = 'narrow' | 'default' | 'wide' | 'full';
export type SectionSpacing = 'none' | 'sm' | 'md' | 'lg';
export type SectionInset = 'compact' | 'default' | 'bleed';

export type SectionProps = JsxElementProps<HTMLElement> & {
	/** Inner measure. Default: `default` (72rem). Independent of `inset`. */
	width?: SectionWidth;
	/** Vertical padding. Default: `md`. */
	spacing?: SectionSpacing;
	/**
	 * Inline gutter. Default: `default`.
	 *
	 * `compact` tightens the gutter; `bleed` removes it. `width="full"` no
	 * longer zeros padding — pair it with `inset="bleed"` for true full-bleed.
	 */
	inset?: SectionInset;
	/** Tints the band so adjacent sections read as separate. */
	tinted?: boolean;
	/** Element to render. Default: `section`. */
	as?: 'section' | 'header' | 'footer' | 'div' | 'main';
	children?: JsxRenderable;
};

export const Section = eco.component<SectionProps, JsxRenderable>({
	dependencies: { stylesheets: ['./section.css'] },
	render: ({
		width = 'default',
		spacing = 'md',
		inset = 'default',
		tinted,
		as: Tag = 'section',
		class: className,
		children,
		...props
	}) => (
		<Tag
			{...props}
			class={cx('block-section', `block-section--${spacing}`, tinted && 'block-section--tinted', className)}
		>
			<div
				class={cx(
					'block-section__inner',
					`block-section__inner--${width}`,
					`block-section__inner--inset-${inset}`,
				)}
			>
				{children}
			</div>
		</Tag>
	),
});
