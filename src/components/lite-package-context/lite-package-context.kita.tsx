import { DepsManager } from "@eco-pages/core";

export function LitePkgContext({
  children,
  contextId,
  class: className,
}: {
  children?: Html.Children;
  contextId: string;
  class: string;
}) {
  return (
    <lite-package-context context-id={contextId} class={className}>
      {children}
    </lite-package-context>
  );
}

LitePkgContext.dependencies = DepsManager.collect({ importMeta: import.meta });
