import { ComponentConfig } from "./get-component-config";

export function getContextDependencies(components: ComponentConfig<any>[]): {
  contextDependencies: string[];
} {
  const contextDependencies = components.flatMap((component) => component.dependencies);
  return {
    contextDependencies,
  };
}
