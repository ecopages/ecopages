import { Navigation } from '@/components/navigation';
import type { EcoComponent } from '@ecopages/core';

export type BaseLayoutProps = {
  children: Html.Children;
  class?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children, class: className }) => {
  return (
    <body>
      <Navigation
        items={[
          { label: 'Home', url: '/' },
          { label: 'Tailwind', url: '/labs/tailwind' },
          { label: 'Async', url: '/labs/async' },
          { label: 'MDX', url: '/test' },
          { label: 'Lite', url: '/labs/lite-context' },
          { label: 'Events', url: '/labs/events' },
          { label: 'Refs', url: '/labs/refs' },
        ]}
      />
      <main class={className}>{children as 'safe'}</main>
    </body>
  );
};

BaseLayout.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./base-layout.css'],
    scripts: ['./base-layout.script.js'],
    components: [Navigation],
  },
};
