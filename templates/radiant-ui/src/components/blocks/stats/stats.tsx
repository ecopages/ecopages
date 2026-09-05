/**
 * Stats — a row of headline numbers.
 *
 * Each entry is a value and its label, with an optional line of context. The
 * value is the loud part, so it renders above the label rather than below it —
 * the reverse of what source order would give you, hence the explicit ordering
 * in the stylesheet.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Section, SectionHeading, type SectionProps } from '../section';

export type Stat = {
	value: JsxRenderable;
	label: JsxRenderable;
	/** Optional line under the label. */
	description?: JsxRenderable;
};

export type StatsProps = Pick<SectionProps, 'width' | 'tinted' | 'spacing' | 'inset' | 'class'> & {
	eyebrow?: JsxRenderable;
	title?: JsxRenderable;
	description?: JsxRenderable;
	stats: Stat[];
};

export const Stats = eco.component<StatsProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./stats.css'],
		components: [Section, SectionHeading],
	},
	render: ({ eyebrow, title, description, stats, class: className, ...section }) => (
		<Section {...section} class={cx('stats', className)}>
			<SectionHeading class="stats__heading" eyebrow={eyebrow} title={title} description={description} />
			<dl class="stats__list">
				{stats.map((stat) => (
					<div class="stats__item">
						<dt class="stats__label">{stat.label}</dt>
						<dd class="stats__value">{stat.value}</dd>
						{stat.description ? <dd class="stats__description">{stat.description}</dd> : null}
					</div>
				))}
			</dl>
		</Section>
	),
});
