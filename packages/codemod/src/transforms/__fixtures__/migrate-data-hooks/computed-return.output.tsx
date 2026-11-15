import { eco } from '@ecopages/core';
import { loadPost, listPosts } from './data';

export default eco.page({
	async paths() {
		return (await listPosts()).paths;
	},
	props: async ({ params }) => {
		const result = await loadPost(String(params.slug));
		return (await result).props;
	},
	render: ({ title }) => <h1>{title}</h1>,
});
