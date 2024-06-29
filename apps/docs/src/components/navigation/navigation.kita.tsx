import { DepsManager, type EcoComponent } from '@ecopages/core';

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

Navigation.dependencies = DepsManager.collect({ importMeta: import.meta, stylesheets: ['./navigation.css'] });
