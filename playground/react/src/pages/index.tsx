import { Counter } from '@/components/counter';
import { RadiantCounter } from '@/components/radiant-counter';
import { Item, Select } from '@/components/select';
import { TanstackTable } from '@/components/tanstack-table';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoPage, GetMetadata } from '@ecopages/core';
import type { JSX } from 'react';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoPage<unknown, JSX.Element> = () => {
  return (
    <BaseLayout className="main-content">
      <h1 className="main-title">Ecopages</h1>
      <a href="/test" className="text-blue-700 underline">
        Test Splitting
      </a>
      <a href="/images" className="text-blue-700 underline">
        Test Images
      </a>
      <Counter defaultValue={10} />
      <RadiantCounter value={5} />
      <Select label="Ice cream flavor">
        <Item>Chocolate</Item>
        <Item>Mint</Item>
        <Item>Strawberry</Item>
        <Item>Vanilla</Item>
      </Select>
      <TanstackTable />
    </BaseLayout>
  );
};

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./index.css'],
    components: [Counter, BaseLayout, TanstackTable, Select, RadiantCounter],
  },
};

export default HomePage;
