import { Navigation } from '@/components/navigation';
import { DepsManager, type EcoComponent } from '@eco-pages/core';

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
          { label: 'Lite', url: '/labs/lite-context' },
        ]}
      />
      <main class={className}>{children as 'safe'}</main>
    </body>
  );
};

BaseLayout.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [Navigation],
});
