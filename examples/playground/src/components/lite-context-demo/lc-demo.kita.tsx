import type { EcoComponent } from '@ecopages/core';

export const ContextProviderDemo: EcoComponent<{
  children?: Html.Children;
  class?: string;
}> = ({ children, class: className }) => {
  return (
    <lc-demo class={className}>
      <p class="lc-demo__label">lc-demo</p>
      {children}
    </lc-demo>
  );
};

ContextProviderDemo.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./lite-context-demo.css'],
    scripts: ['./lite-context-demo.script.ts'],
  },
};
