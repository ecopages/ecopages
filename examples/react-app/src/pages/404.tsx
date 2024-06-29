import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoComponent, type Error404TemplateProps } from '@ecopages/core';

const Error404: EcoComponent<Error404TemplateProps> = (htmlTemplateProps) => {
  return (
    <BaseLayout>
      <div className="error404">
        <h1>404 - Page Not Found</h1>
        <p>The page you are looking for does not exist.</p>
      </div>
    </BaseLayout>
  );
};

Error404.dependencies = DepsManager.collect({
  importMeta: import.meta,
  stylesheets: ['./404.css'],
  components: [BaseLayout],
});

export default Error404;
