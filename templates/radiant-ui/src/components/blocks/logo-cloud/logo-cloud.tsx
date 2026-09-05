/**
 * LogoCloud — the "trusted by" strip.
 *
 * Logos arrive at wildly different aspect ratios, so each one is boxed to a
 * shared height and centred rather than laid out on its own terms. `muted`
 * desaturates them until hover, which keeps a busy row from competing with the
 * sections around it.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Section, type SectionProps } from '../section';

export type LogoCloudItem = {
	/** The mark itself — an `<img>`, an inline `<svg>`, or a wordmark. */
	logo: JsxRenderable;
	/** Company name, used as the link title when `href` is set. */
	name: string;
	href?: string;
};

export type LogoCloudProps = Pick<SectionProps, 'width' | 'tinted' | 'spacing' | 'inset' | 'class'> & {
	/** Line above the row. */
	title?: JsxRenderable;
	logos: LogoCloudItem[];
	/** Desaturate until hover. Default: true. */
	muted?: boolean;
};

export const LogoCloud = eco.component<LogoCloudProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./logo-cloud.css'],
		components: [Section],
	},
	render: ({ title, logos, muted = true, class: className, ...section }) => (
		<Section {...section} spacing="sm" class={cx('logo-cloud', muted && 'logo-cloud--muted', className)}>
			{title ? <p class="logo-cloud__title">{title}</p> : null}
			<ul class="logo-cloud__list">
				{logos.map((entry) => (
					<li class="logo-cloud__item">
						{entry.href ? (
							<a href={entry.href} title={entry.name} class="logo-cloud__link">
								{entry.logo}
							</a>
						) : (
							entry.logo
						)}
					</li>
				))}
			</ul>
		</Section>
	),
});
