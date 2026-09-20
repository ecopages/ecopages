import type { EcoComponent, GetMetadata, GetStaticProps, PageProps } from '@ecopages/core';

type IndexProps = { title: string };

export const getStaticPaths = async () => ({ paths: [] });
export const getStaticProps: GetStaticProps<IndexProps> = async () => ({ props: { title: 'Home' } });
export const getMetadata: GetMetadata<IndexProps> = async () => ({ title: 'Home' });

const IndexPage: EcoComponent<PageProps<IndexProps>> = ({ title }) => <h1>{title}</h1>;
IndexPage.config = {
	layout: 'main',
	dependencies: { stylesheets: ['./index.css'] },
};

export default IndexPage;
