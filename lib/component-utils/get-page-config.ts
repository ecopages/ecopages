import { SeoHeadProps } from "@/includes/head/seo.kita";
import { ComponentConfig } from "./get-component-config";
import { getContextDependencies } from "./get-context-dependencies";

type PageConfigOptions = {
  metadata: SeoHeadProps;
  components: ComponentConfig[];
};

type PageConfig = {
  metadata: SeoHeadProps;
  contextStylesheets: string[];
  contextScripts: string[];
};

export function getPageConfig({ metadata, components }: PageConfigOptions): PageConfig {
  const { contextStylesheets, contextScripts } = getContextDependencies(components);

  return {
    metadata,
    contextStylesheets,
    contextScripts,
  };
}
