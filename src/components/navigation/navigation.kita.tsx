import type { EcoComponent } from "root/lib/eco-pages.types";
import { collectComponentDependencies } from "root/lib/component-utils/collect-component-dependencies";

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
            <a href={url}>{label as "safe"}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

Navigation.dependencies = collectComponentDependencies({ importMeta: import.meta });
