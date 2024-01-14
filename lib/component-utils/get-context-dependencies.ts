import { ComponentConfig } from "./get-component-config";

export function getContextDependencies(components: ComponentConfig[]): {
  contextStylesheets: string[];
  contextScripts: string[];
} {
  const contextStylesheets = components
    .filter((component) => component.stylesheet)
    .map((component) => component.stylesheet!);

  const contextScripts = components
    .filter((component) => component.script)
    .map((component) => component.script!);

  return {
    contextStylesheets,
    contextScripts,
  };
}
