import type { EcoComponent } from "@/types";
import { getComponentDependencies } from "root/lib/component-utils/get-component-config";

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

Navigation.dependencies = getComponentDependencies({ importMeta: import.meta });
