import {
  ContextProviderDemo,
  ContextProviderDemoEditor,
  ContextProviderDemoVisualizer,
} from '@/components/lite-context-demo';
import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoComponent, type GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Lite Element',
  description: 'Testing lite element with Kita',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static', 'lite-element'],
});

const LiteElement: EcoComponent = () => {
  return (
    <BaseLayout class="main-content">
      <ContextProviderDemo>
        <ContextProviderDemoVisualizer />
        <ContextProviderDemoEditor />
      </ContextProviderDemo>
    </BaseLayout>
  );
};

LiteElement.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout, ContextProviderDemo, ContextProviderDemoVisualizer, ContextProviderDemoEditor],
});

export default LiteElement;
