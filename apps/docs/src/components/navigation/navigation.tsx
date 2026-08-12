import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

export type NavigationProps = {
	items: {
		label: string | JsxRenderable;
		href: string;
		target?: '_blank' | '_self';
		rel?: string;
		'aria-label'?: string;
	}[];
};

export const Navigation = eco.component<NavigationProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./navigation.css'],
		components: [ThemeToggle],
	},
	render: ({ items }) => {
		return (
			<nav class="navigation" aria-label="Site">
				<ul>
					{items.map(({ label, href, target = '_self', rel, 'aria-label': ariaLabel }) => (
						<li>
							<RuiButton
								href={href}
								target={target}
								rel={rel}
								variant="ghost"
								size="sm"
								aria-label={ariaLabel}
							>
								{label}
							</RuiButton>
						</li>
					))}
					<li>
						<ThemeToggle id="toggle-dark-mode" label="Theme" />
					</li>
				</ul>
			</nav>
		);
	},
});
