import { eco } from '@ecopages/core';
import { html } from '@ecopages/core/html';

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

	render: ({ items }) => {
		return html`
			<nav class="navigation">
				<ul>
					!${items.map(
						({ label, url }) =>
							html`<li>
								<a href="${url}">${label}</a>
							</li>`,
					)}
				</ul>
			</nav>
		`;
	},
});
