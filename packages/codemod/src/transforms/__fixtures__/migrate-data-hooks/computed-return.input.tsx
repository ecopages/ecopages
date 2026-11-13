import { eco } from '@ecopages/core';
import { loadPost, listPosts } from './data';

export default eco.page({
	async staticPaths() {
		return listPosts();
	},
	staticProps: async ({ pathname }) => {
		const result = await loadPost(String(pathname.params.slug));
		return result;
	},
	render: ({ title }) => <h1>{title}</h1>,
});
