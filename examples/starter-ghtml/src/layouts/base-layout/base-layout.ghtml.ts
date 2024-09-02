import { type EcoComponent, html } from '@ecopages/core';

export type BaseLayoutProps = {
  children: string;
  class?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children, class: className }) =>
  html`<body>
    <main class=${className}>!${children}</main>
  </body>`;

BaseLayout.config = {
  importMeta: import.meta,
  dependencies: { stylesheets: ['./base-layout.css'], scripts: ['./base-layout.script.ts'] },
};
