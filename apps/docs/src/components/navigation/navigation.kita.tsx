import type { EcoComponent } from '@ecopages/core';
import { RadiantSwitch } from '../switch/switch.kita';

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
					<RadiantSwitch id="toggle-dark-mode" checked={true} label="Theme" hiddenLabel />
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
		components: [RadiantSwitch],
	},
};
