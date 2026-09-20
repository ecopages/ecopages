import type { EcoComponent, GetStaticPaths, PageProps } from '@ecopages/core';

type IndexProps = { title: string };

export const toString = () => 'keep-me';
export const getStaticPaths: GetStaticPaths = async () => ({ paths: [] });

const IndexPage: EcoComponent<PageProps<IndexProps>> = () => <h1>Home</h1>;
IndexPage.config = { layout: 'main' };

export default IndexPage;
