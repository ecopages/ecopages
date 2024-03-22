import { DepsManager } from "@eco-pages/core";

export function LiteContextDemo({
  children,
  class: className,
}: {
  children?: Html.Children;
  class?: string;
}) {
  return (
    <lc-demo class={className}>
      <p class="lc-demo__label">lc-demo</p>
      {children}
    </lc-demo>
  );
}

LiteContextDemo.dependencies = DepsManager.import({
  importMeta: import.meta,
  scripts: ["./lite-context-demo.script.ts"],
  stylesheets: ["./lite-context-demo.css"],
});
