import type { EcoComponent } from '@ecopages/core';
import { loadPost } from './posts.ts';

const staticProps = async () => ({ props: { post: await loadPost() } });
const describePost = () => ({ title: 'Post' });

export { staticProps as getStaticProps, describePost as getMetadata };

const Page: EcoComponent = () => <h1>Post</h1>;

export default Page;
