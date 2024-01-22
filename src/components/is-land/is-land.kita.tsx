import type { EcoComponent } from "root/lib/eco-pages.types";
import { collectComponentDependencies } from "root/lib/component-utils/collect-component-dependencies";
import type { IsLandObserverProps } from "./is-land.script";

export const IsLand: EcoComponent<IsLandObserverProps> = ({ children, ...props }) => {
  return <is-land {...props}>{children}</is-land>;
};

IsLand.dependencies = collectComponentDependencies({ importMeta: import.meta });
