import { DepsManager } from "@eco-pages/core";

export function LitePkgContext({
  children,
  class: className,
}: {
  children?: Html.Children;
  class: string;
}) {
  return <lite-package-context class={className}>{children}</lite-package-context>;
}

LitePkgContext.dependencies = DepsManager.collect({ importMeta: import.meta });
