import { LiteContextDemo, LiteContextDemoEditor, LiteContextDemoVisualizer } from '@/components/lite-context-demo';
import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoComponent, type GetMetadata } from '@eco-pages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Lite Element',
  description: 'Testing lite element with Kita',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static', 'lite-element'],
});

const LiteElement: EcoComponent = () => {
  return (
    <BaseLayout class="main-content">
      <LiteContextDemo>
        <LiteContextDemoVisualizer />
        <LiteContextDemoEditor />
      </LiteContextDemo>
    </BaseLayout>
  );
};

LiteElement.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout, LiteContextDemo, LiteContextDemoVisualizer, LiteContextDemoEditor],
});

export default LiteElement;
