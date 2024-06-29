import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoComponent, type GetMetadata } from '@ecopages/core';

const getData = async () => {
  return new Promise<string>((resolve) => {
    setTimeout(() => {
      resolve(`Async·page·${new Date().toISOString()}`);
    }, 1000);
  });
};

const LabsAsyncPage: EcoComponent = async () => {
  const data = await getData();

  return (
    <BaseLayout>
      <div class="banner">
        <h1 class="banner__title">Async Page</h1>
        <p>The text below is collected asyncronously</p>
        <p>
          <i safe>{data}</i>
        </p>
      </div>
    </BaseLayout>
  );
};

LabsAsyncPage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout],
});

export default LabsAsyncPage;
