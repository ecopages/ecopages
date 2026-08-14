import { eco } from '@ecopages/core';

export type NavigationProps = {
	items: {
		label: string;
		url: string;
	}[];
};

export const Navigation = eco.component<NavigationProps>({
	dependencies: {
		stylesheets: ['./navigation.css'],
	},

	render: ({ items }) => (
		<nav class="navigation">
			<ul>
				{items.map(({ label, url }) => (
					<li>
						<a href={url}>{label}</a>
					</li>
				))}
			</ul>
		</nav>
	),
});
