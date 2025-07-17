import { type EcoComponent, html } from '@ecopages/core';

export type NavigationProps = {
	items: {
		label: string;
		url: string;
	}[];
};

export const Navigation: EcoComponent<NavigationProps> = ({ items }) => {
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
};

Navigation.config = {
	importMeta: import.meta,
	dependencies: {
		stylesheets: ['./navigation.css'],
	},
};
