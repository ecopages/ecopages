import type { EcoComponent } from '@ecopages/core';

export async function getStaticPaths() {
	return { paths: [] };
}

export async function getStaticProps() {
	return { props: { title: 'Home' } };
}

export function getMetadata() {
	return { title: 'Home' };
}

const Page: EcoComponent = () => <h1>Home</h1>;

export default Page;
