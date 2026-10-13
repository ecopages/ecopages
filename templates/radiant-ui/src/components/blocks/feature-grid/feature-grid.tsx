/**
 * FeatureGrid — a section header over a grid of feature cards.
 *
 * The most repeated marketing block there is. Each feature is `{ icon, title,
 * description, href }`; entries with an `href` get a link affordance and the
 * whole card becomes clickable.
 *
 * `columns` caps the grid; below that the layout falls back to whatever fits,
 * so a three-column grid becomes two then one without extra breakpoints.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading, type SectionProps } from '../section';

export type Feature = {
	/** Glyph or illustration above the title. */
	icon?: JsxRenderable;
	title: JsxRenderable;
	description?: JsxRenderable;
	/** Turns the card into a link. */
	href?: string;
	/** Link text. Default: `Learn more`. */
	linkLabel?: string;
};

export type FeatureGridProps = Pick<SectionProps, 'width' | 'tinted' | 'spacing' | 'inset' | 'class'> & {
	eyebrow?: JsxRenderable;
	title?: JsxRenderable;
	description?: JsxRenderable;
	features: Feature[];
	/** Maximum columns on a wide screen. Default: 3. */
	columns?: 2 | 3 | 4;
};

export const FeatureGrid = eco.component<FeatureGridProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./feature-grid.css'],
		components: [Section, SectionHeading, Button],
	},
	render: ({ eyebrow, title, description, features, columns = 3, class: className, ...section }) => (
		<Section {...section} class={cx('feature-grid', className)}>
			<SectionHeading class="feature-grid__heading" eyebrow={eyebrow} title={title} description={description} />
			<ul class={cx('feature-grid__list', `feature-grid__list--${columns}`)}>
				{features.map((feature) => (
					<li class="feature-grid__item">
						{feature.icon ? (
							<span class="feature-grid__icon" aria-hidden="true">
								{feature.icon}
							</span>
						) : null}
						<h3 class="feature-grid__title">{feature.title}</h3>
						{feature.description ? <p class="feature-grid__body">{feature.description}</p> : null}
						{feature.href ? (
							<Button href={feature.href} variant="link" size="none" class="feature-grid__link">
								{feature.linkLabel ?? 'Learn more'}
							</Button>
						) : null}
					</li>
				))}
			</ul>
		</Section>
	),
});
