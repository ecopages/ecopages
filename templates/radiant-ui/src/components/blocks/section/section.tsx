/**
 * Section — the shell every block sits in.
 *
 * Blocks are page-width bands: full-bleed background, content constrained to a
 * readable measure, consistent vertical rhythm between them. Repeating that
 * wrapper in each block is how the rhythm drifts, so it lives here once and
 * every block composes it.
 *
 * `width` controls the inner measure and `spacing` the band's padding. Set
 * `spacing="none"` when a block paints its own edge-to-edge surface.
 */
import { eco } from '@ecopages/core';
import type { JsxElementProps, JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';

export type SectionWidth = 'narrow' | 'default' | 'wide' | 'full';
export type SectionSpacing = 'none' | 'sm' | 'md' | 'lg';

export type SectionProps = JsxElementProps<HTMLElement> & {
	/** Inner measure. Default: `default` (72rem). */
	width?: SectionWidth;
	/** Vertical padding. Default: `md`. */
	spacing?: SectionSpacing;
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
			<div class={cx('block-section__inner', `block-section__inner--${width}`)}>{children}</div>
		</Tag>
	),
});
