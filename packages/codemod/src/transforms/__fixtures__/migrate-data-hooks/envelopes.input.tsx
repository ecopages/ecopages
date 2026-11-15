import { eco } from '@ecopages/core';

type PostProps = { title: string };

export default eco.page<PostProps>({
	staticPaths: async () => ({
		paths: [{ params: { slug: 'a' } }, { params: { slug: 'b' } }],
	}),
	staticProps: async ({ pathname }) => {
		const slug = String(pathname.params.slug);
		return { props: { title: slug } };
	},
	render: ({ title }) => <h1>{title}</h1>,
});
