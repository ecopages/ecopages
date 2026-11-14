import { eco } from '@ecopages/core';
import type { GetStaticProps, GetStaticPaths } from '@ecopages/core';

const staticPaths: GetStaticPaths = async () => {
	const posts = ['a', 'b'];
	return { paths: posts.map((slug) => ({ params: { slug } })) };
};

async function staticProps({ pathname }: Parameters<GetStaticProps<{ slug: string }>>[0]) {
	const slug = String(pathname.params.slug);
	if (!slug) {
		return { props: { slug: 'none' } };
	}
	const props = { slug };
	return { props };
}

export default eco.page({
	staticPaths,
	staticProps,
	render: ({ slug }) => <h1>{slug}</h1>,
});
