import { eco } from '@ecopages/core';
import { loadPost } from './posts.ts';

const staticProps = async () => ({
	post: await loadPost(),
});
const describePost = () => ({ title: 'Post' });

export default eco.page({
	props: staticProps,
	metadata: describePost,
	render: () => <h1>Post</h1>,
});
