import type { EcoComponent } from '@ecopages/core';

export type BaseLayoutProps = {
  children: JSX.Element;
  class?: string;
  id?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children, class: className }) => {
  return (
    <body>
      <main className={className}>{children}</main>
    </body>
  );
};

BaseLayout.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['layouts/base-layout/base-layout.css'],
    scripts: ['layouts/base-layout/base-layout.script.js'],
  },
};
