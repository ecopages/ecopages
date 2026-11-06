import { eco } from '@ecopages/core';
const getStaticProps = async () => ({ props: { title: 'Home' } });

export type Data = Awaited<ReturnType<typeof getStaticProps>>;

export default eco.page({
	staticProps: getStaticProps,
	metadata: ({ props }) => ({ title: props.title }),
	render: ({ title }) => <h1>{title}</h1>,
});
