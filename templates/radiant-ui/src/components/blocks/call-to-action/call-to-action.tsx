/**
 * CallToAction — the band that asks for the click.
 *
 * A title, a line of persuasion, and the actions. `variant="panel"` puts it on
 * a bordered surface inside the page; `variant="band"` lets it run full width
 * as a tinted strip between two sections.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Heading } from '@/components/ui/heading';
import { Section, type SectionProps } from '../section';

export type CallToActionProps = Pick<SectionProps, 'width' | 'spacing' | 'class'> & {
	eyebrow?: JsxRenderable;
	title: JsxRenderable;
	description?: JsxRenderable;
	/** Buttons or links. */
	actions?: JsxRenderable;
	/** `panel` sits on a card; `band` fills the width. Default: `panel`. */
	variant?: 'panel' | 'band';
	/** Puts the actions beside the copy instead of below it. */
	inline?: boolean;
};

export const CallToAction = eco.component<CallToActionProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./call-to-action.css'],
		components: [Section, Heading],
	},
	render: ({ eyebrow, title, description, actions, variant = 'panel', inline, class: className, ...section }) => (
		<Section {...section} tinted={variant === 'band'} class={cx('cta', className)}>
			<div class={cx('cta__surface', `cta__surface--${variant}`, inline && 'cta__surface--inline')}>
				<Heading
					class="cta__copy"
					align={inline ? 'start' : 'center'}
					eyebrow={eyebrow}
					title={title}
					description={description}
				/>
				{actions ? <div class="cta__actions">{actions}</div> : null}
			</div>
		</Section>
	),
});
