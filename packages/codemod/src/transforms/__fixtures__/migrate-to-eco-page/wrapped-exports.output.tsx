import { eco } from '@ecopages/core';

type PostProps = { slug: string };

export default eco.page<PostProps>({
	paths: async () => [{ params: { slug: 'a' } }],

	props: async ({ params }) => ({
		slug: String(params.slug),
	}),

	metadata: ({ props }) => ({ title: props.slug }),
	render: ({ slug }) => <h1>{slug}</h1>,
});
