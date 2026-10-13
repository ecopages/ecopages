/**
 * NavigationHeader — the site topbar.
 *
 * A brand mark on the left, navigation in the middle, actions on the right, and
 * a disclosure for the same links on narrow screens. The mobile half is the
 * part that usually goes missing: this renders the links twice — once in the
 * horizontal bar, once in a `<details>` panel below it — so navigation works
 * before any JavaScript loads and keeps working without it.
 *
 * `links` covers the common case. `nav` replaces the whole middle slot when the
 * header needs a `NavigationMenu` with dropdown panels instead.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Section, type SectionProps } from '../section';

export type NavigationLink = {
	label: JsxRenderable;
	href: string;
	/** Marks the link as the current page. */
	current?: boolean;
};

export type NavigationHeaderProps = Pick<SectionProps, 'width' | 'inset' | 'class'> & {
	/** Logo or wordmark, usually wrapped in a link to `/`. */
	brand?: JsxRenderable;
	/** Primary navigation. Ignored when `nav` is given. */
	links?: NavigationLink[];
	/** Replaces the navigation slot entirely. */
	nav?: JsxRenderable;
	/** Right-hand slot — a theme toggle, a sign-in button. */
	actions?: JsxRenderable;
	/** Accessible name for the nav landmark. Default: `Main`. */
	label?: string;
	/** Keeps the bar pinned while the page scrolls. */
	sticky?: boolean;
};

function navList(links: NavigationLink[], variant: 'bar' | 'panel'): JsxRenderable {
	return (
		<ul class={`site-header__list site-header__list--${variant}`}>
			{links.map((link) => (
				<li>
					<a href={link.href} class="site-header__link" aria-current={link.current ? 'page' : undefined}>
						{link.label}
					</a>
				</li>
			))}
		</ul>
	);
}

export const NavigationHeader = eco.component<NavigationHeaderProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./navigation-header.css'],
		components: [Section],
	},
	render: ({ brand, links, nav, actions, label = 'Main', sticky, class: className, ...section }) => (
		<Section
			{...section}
			as="header"
			spacing="none"
			class={cx('site-header', sticky && 'site-header--sticky', className)}
		>
			<div class="site-header__bar">
				{brand ? <div class="site-header__brand">{brand}</div> : null}
				<nav class="site-header__nav" aria-label={label}>
					{nav ?? (links ? navList(links, 'bar') : null)}
				</nav>
				{actions ? <div class="site-header__actions">{actions}</div> : null}
				{links && !nav ? (
					<details class="site-header__disclosure">
						<summary class="site-header__toggle" aria-label="Toggle navigation">
							<span class="site-header__toggle-bars" aria-hidden="true"></span>
						</summary>
						<nav class="site-header__panel" aria-label={`${label} (compact)`}>
							{navList(links, 'panel')}
						</nav>
					</details>
				) : null}
			</div>
		</Section>
	),
});
