import type { EcoComponent } from '@ecopages/core';
import { ThemeToggle } from '../theme-toggle/theme-toggle.kita';

export type NavigationProps = {
	items: {
		label: string | JSX.Element;
		href: string;
		target?: '_blank' | '_self';
	}[];
};

export const Navigation: EcoComponent<NavigationProps> = ({ items }) => {
	return (
		<nav class="navigation">
			<ul>
				<li>
					<ThemeToggle id="toggle-dark-mode" label="Theme" hiddenLabel data-eco-persist="theme-toggle" />
				</li>
				{items.map(({ label, href, target = '_self' }) => (
					<li>
						<a href={href} target={target}>
							{label as 'safe'}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
};

Navigation.config = {
	dependencies: {
		stylesheets: ['./navigation.css'],
		components: [ThemeToggle],
	},
};
