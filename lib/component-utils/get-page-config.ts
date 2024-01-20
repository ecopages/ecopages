import type { SeoHeadProps } from "@/includes/head/seo.kita";
import type { ComponentConfig } from "./get-component-config";
import { getContextDependencies } from "./get-context-dependencies";

type PageConfigOptions = {
  metadata: SeoHeadProps;
  components: ComponentConfig<any>[];
};

type PageConfig = {
  metadata: SeoHeadProps;
  contextDependencies: string[];
};

export function getPageConfig({ metadata, components }: PageConfigOptions): PageConfig {
  const { contextDependencies } = getContextDependencies(components);

  return {
    metadata,
    contextDependencies,
  };
}
