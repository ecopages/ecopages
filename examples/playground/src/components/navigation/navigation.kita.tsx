import type { EcoComponent } from '@ecopages/core';

export type NavigationProps = {
  items: {
    label: string;
    url: string;
  }[];
};

export const Navigation: EcoComponent<NavigationProps> = ({ items }) => {
  return (
    <nav class="navigation">
      <ul>
        {items.map(({ label, url }) => (
          <li>
            <a href={url}>{label as 'safe'}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

Navigation.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./navigation.css'],
  },
};
