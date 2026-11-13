import { eco } from '@ecopages/core';

type PostProps = { title: string };

export default eco.page<PostProps>({
	paths: async () => [{ params: { slug: 'a' } }, { params: { slug: 'b' } }],
	props: async ({ pathname }) => {
		const slug = String(pathname.params.slug);
		return { title: slug };
	},
	render: ({ title }) => <h1>{title}</h1>,
});
