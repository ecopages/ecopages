import { CodeBlock } from '@/components/code-block/code-block.kita';
import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoPage } from '@eco-pages/core';

const GettingStarted: EcoPage = (htmlTemplateProps) => {
  return (
    <BaseLayout class="prose">
      <h1>Getting Started</h1>
      <CodeBlock>{`"scripts": {
	"dev": "eco-pages dev",
	"build": "eco-pages build",
	"start": "eco-pages start",
	"preview": "eco-pages preview"
}`}</CodeBlock>
    </BaseLayout>
  );
};

GettingStarted.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  stylesheets: ['./404.css'],
  components: [BaseLayout],
});

export default GettingStarted;
