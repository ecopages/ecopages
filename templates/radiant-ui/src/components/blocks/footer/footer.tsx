/**
 * Footer — link columns over a legal row.
 *
 * `columns` is the sitemap half; `legal` is the copyright line and `social` the
 * icon row beside it. Everything is optional, so the same block covers a
 * three-column marketing footer and a one-line footer on a landing page.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Section, type SectionProps } from '../section';

export type FooterLink = {
	label: JsxRenderable;
	href: string;
	/** Adds `rel="noreferrer"` and opens in a new tab. */
	external?: boolean;
};

export type FooterColumn = {
	title: JsxRenderable;
	links: FooterLink[];
};

export type FooterProps = Pick<SectionProps, 'width' | 'tinted' | 'class'> & {
	/** Logo and a line about the product. */
	brand?: JsxRenderable;
	description?: JsxRenderable;
	columns?: FooterColumn[];
	/** Copyright or legal line. */
	legal?: JsxRenderable;
	/** Icon links beside the legal line. */
	social?: JsxRenderable;
};

export const Footer = eco.component<FooterProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./footer.css'],
		components: [Section],
	},
	render: ({ brand, description, columns, legal, social, class: className, ...section }) => (
		<Section {...section} as="footer" class={cx('site-footer', className)}>
			{brand || description || columns ? (
				<div class="site-footer__top">
					{brand || description ? (
						<div class="site-footer__brand">
							{brand}
							{description ? <p class="site-footer__tagline">{description}</p> : null}
						</div>
					) : null}
					{columns ? (
						<div class="site-footer__columns">
							{columns.map((column) => (
								<div class="site-footer__column">
									<h2 class="site-footer__column-title">{column.title}</h2>
									<ul class="site-footer__links">
										{column.links.map((link) => (
											<li>
												<a
													href={link.href}
													class="site-footer__link"
													target={link.external ? '_blank' : undefined}
													rel={link.external ? 'noreferrer' : undefined}
												>
													{link.label}
												</a>
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
					) : null}
				</div>
			) : null}
			{legal || social ? (
				<div class="site-footer__bottom">
					{legal ? <p class="site-footer__legal">{legal}</p> : null}
					{social ? <div class="site-footer__social">{social}</div> : null}
				</div>
			) : null}
		</Section>
	),
});
