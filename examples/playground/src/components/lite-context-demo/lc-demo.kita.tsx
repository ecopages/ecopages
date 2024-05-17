import { DepsManager } from '@eco-pages/core';

export function ContextProviderDemo({
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

ContextProviderDemo.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  scripts: ['./lite-context-demo.script.ts'],
  stylesheets: ['./lite-context-demo.css'],
});
