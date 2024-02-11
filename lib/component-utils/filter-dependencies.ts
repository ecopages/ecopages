import type { EcoComponent, EcoComponentDependencies } from "../eco-pages.types";

export function filterDependencies(
  component: EcoComponent<unknown>,
  type: "scripts" | "stylesheets"
): EcoComponent<unknown> {
  const dependencies = component.dependencies as EcoComponentDependencies;

  if (!dependencies) return component;

  return {
    ...component,
    dependencies: {
      [type]: dependencies[type],
    },
  } as EcoComponent<unknown>;
}
