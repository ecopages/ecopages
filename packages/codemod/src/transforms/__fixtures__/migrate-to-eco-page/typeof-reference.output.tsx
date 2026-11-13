import { eco } from '@ecopages/core';
const getStaticProps = async () => ({
	title: 'Home',
});

export type Data = Awaited<ReturnType<typeof getStaticProps>>;

export default eco.page({
	props: getStaticProps,
	metadata: ({ props }) => ({ title: props.title }),
	render: ({ title }) => <h1>{title}</h1>,
});
