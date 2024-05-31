import { DepsManager, type EcoComponent } from '@ecopages/core';

export type BaseLayoutProps = {
  children: Html.Children;
  class?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children, class: className }) => {
  return (
    <body>
      <main class={className}>{children}</main>
    </body>
  );
};

BaseLayout.dependencies = DepsManager.collect({
  importMeta: import.meta,
});
