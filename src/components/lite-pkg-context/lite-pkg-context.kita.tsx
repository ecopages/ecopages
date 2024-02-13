import { DepsManager } from "@eco-pages/core";

export function LitePkgContext({
  children,
  contextId,
}: {
  children?: Html.Children;
  contextId: string;
}) {
  return <lite-pkg-context context-id={contextId}>{children}</lite-pkg-context>;
}

LitePkgContext.dependencies = DepsManager.collect({ importMeta: import.meta });
