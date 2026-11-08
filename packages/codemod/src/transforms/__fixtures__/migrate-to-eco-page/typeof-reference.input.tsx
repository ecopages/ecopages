import type { EcoComponent, GetMetadata, GetStaticProps } from '@ecopages/core';

export const getStaticProps: GetStaticProps<{ title: string }> = async () => ({ props: { title: 'Home' } });

export type Data = Awaited<ReturnType<typeof getStaticProps>>;

export const getMetadata: GetMetadata<Data['props']> = ({ props }) => ({ title: props.title });

const Page: EcoComponent<Data['props']> = ({ title }) => <h1>{title}</h1>;

export default Page;
