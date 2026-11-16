import { eco } from '../src/eco/eco.ts';

declare const cond: boolean;

eco.page({
	// @ts-expect-error the route sets params on what render receives
	props: () => ({ params: { slug: 'a' } }),
	render: () => '',
});

// @ts-expect-error the route sets query on what render receives, so no overload accepts the hook
eco.page({ cache: 'dynamic', props: ({ query }) => ({ query }), render: () => '' });

eco.page({
	// @ts-expect-error one branch of the union returns params
	props: () => (cond ? { title: 'a' } : { params: {} }),
	render: () => '',
});

eco.page({
	cache: 'dynamic',
	props: ({ params, query }) => ({ slug: params.slug, search: query.q }),
	render: ({ slug, search, params }) => `${String(slug)}${String(search)}${String(params?.slug)}`,
});

eco.page({
	props: ({ params }) => {
		if (!params.slug) return { post: null };
		return { post: { title: String(params.slug) } };
	},
	render: ({ post }) => post?.title ?? '',
});

eco.page({
	cache: 'dynamic',
	props: () => (cond ? { a: 1 } : { b: 2 }),
	render: () => '',
});

eco.page({ props: () => undefined, render: () => '' });
eco.page({ cache: 'dynamic', props: async () => null, render: () => '' });
