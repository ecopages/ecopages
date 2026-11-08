import { eco } from '@ecopages/core';
import { loadPost } from './posts.ts';

const staticProps = async () => ({ props: { post: await loadPost() } });
const describePost = () => ({ title: 'Post' });

export default eco.page({
	staticProps: staticProps,
	metadata: describePost,
	render: () => <h1>Post</h1>,
});
