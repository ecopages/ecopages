import { RadiantTodoApp } from '@/components/radiant-todo-app';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent } from '@ecopages/core';

const RadiantPage: EcoComponent = async () => {
  return (
    <BaseLayout>
      <RadiantTodoApp />
    </BaseLayout>
  );
};

RadiantPage.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout, RadiantTodoApp],
  },
};

export default RadiantPage;