import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoPage } from '@ecopages/core';

const LabsPage: EcoPage = () => {
  return (
    <BaseLayout>
      <lite-refs class="grid gap-3">
        <button class="bg-blue-700 text-white px-2 py-1 rounded-md" type="button" data-ref="create-ref">
          Add Ref
        </button>
        <div class="bg-gray-100 text-black p-3" data-ref="ref-container">
          <div class="bg-gray-100 text-black p-3" data-ref="ref-item">
            Ref Item
          </div>
        </div>
        <div class="bg-gray-100 text-black p-3" data-ref="ref-count">
          Ref Count: 1
        </div>
      </lite-refs>
    </BaseLayout>
  );
};

LabsPage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  scripts: ['./lite-refs.script.ts'],
  components: [BaseLayout],
});

export default LabsPage;
