import { BaseLayout } from '@/layouts/base-layout';
import type { EcoPage, GetMetadata } from '@ecopages/core';

const TailwindPage: EcoPage = () => {
  return (
    <BaseLayout>
      <div class="banner">
        <h1 class="banner__title inline-flex items-center gap-4">
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          Labs Page
        </h1>
        <p>
          in this page styles are applied using tailwindcss on the <span class="text-red-500 font-bold">markup</span>.
        </p>
        <p>
          Please note the preferred way is to use it following the scaffolding pattern using "my-component.css" and the
          "@apply" directive.
        </p>
      </div>
    </BaseLayout>
  );
};

TailwindPage.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout],
  },
};

export const getMetadata: GetMetadata = () => ({
  title: 'Labs page',
  description: 'Tailwind inline styles applied on the markup.',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

export default TailwindPage;
