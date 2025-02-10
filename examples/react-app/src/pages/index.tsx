import { Counter } from '@/components/counter';
import { Item, Select } from '@/components/select';
import { TanstackTable } from '@/components/tanstack-table';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoPage, GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoPage = () => {
  return (
    <BaseLayout class="main-content">
      <>
        <h1 className="main-title">Ecopages</h1>
        <a href="/test">Test Splitting</a>
        <Counter defaultValue={10} />
        <Select label="Ice cream flavor">
          <Item>Chocolate</Item>
          <Item>Mint</Item>
          <Item>Strawberry</Item>
          <Item>Vanilla</Item>
        </Select>
        <TanstackTable />
      </>
    </BaseLayout>
  );
};

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./index.css'],
    components: [Counter, BaseLayout, TanstackTable, Select, Item],
  },
};

export default HomePage;
