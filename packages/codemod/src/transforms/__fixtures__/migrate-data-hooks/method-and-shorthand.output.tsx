import { eco } from '@ecopages/core';
import type { GetProps, GetPaths } from '@ecopages/core';

const staticPaths: GetPaths = async () => {
	const posts = ['a', 'b'];
	return posts.map((slug) => ({ params: { slug } }));
};

async function staticProps({ pathname }: Parameters<GetProps<{ slug: string }>>[0]) {
	const slug = String(pathname.params.slug);
	if (!slug) {
		return { slug: 'none' };
	}
	const props = { slug };
	return props;
}

export default eco.page({
	paths: staticPaths,
	props: staticProps,
	render: ({ slug }) => <h1>{slug}</h1>,
});
