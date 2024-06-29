import {
  ContextProviderDemo,
  ContextProviderDemoEditor,
  ContextProviderDemoVisualizer,
} from '@/components/lite-context-demo';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent, GetMetadata } from '@ecopages/core';

const RadiantElement: EcoComponent = () => {
  return (
    <BaseLayout class="main-content">
      <ContextProviderDemo>
        <ContextProviderDemoVisualizer />
        <ContextProviderDemoEditor />
      </ContextProviderDemo>
    </BaseLayout>
  );
};

RadiantElement.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout, ContextProviderDemo, ContextProviderDemoVisualizer, ContextProviderDemoEditor],
  },
};

export const getMetadata: GetMetadata = () => ({
  title: 'Lite Element',
  description: 'Testing Radiant Context with Kita',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static', 'radiant'],
});

export default RadiantElement;
