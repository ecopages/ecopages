import { eco } from '@ecopages/core';

type PostProps = { slug: string };

export default eco.page<PostProps>({
	staticPaths: async () => ({ paths: [{ params: { slug: 'a' } }] }),

	staticProps: async ({ pathname }) => ({
		props: { slug: String(pathname.params.slug) },
	}),

	metadata: ({ props }) => ({ title: props.slug }),
	render: ({ slug }) => <h1>{slug}</h1>,
});
