import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent } from '@ecopages/core';

const LabsRoot: EcoComponent = () => {
  return (
    <BaseLayout>
      <div>LABS ROOT TEST</div>
    </BaseLayout>
  );
};

LabsRoot.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./404.css'],
    components: [BaseLayout],
  },
};

export default LabsRoot;
