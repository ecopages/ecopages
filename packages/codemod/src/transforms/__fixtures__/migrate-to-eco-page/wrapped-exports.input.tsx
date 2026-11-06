import { eco } from '@ecopages/core';
import type { EcoComponent, PageProps } from '@ecopages/core';

type PostProps = { slug: string };

export const getStaticPaths = eco.staticPaths(async () => ({ paths: [{ params: { slug: 'a' } }] }));
export const getStaticProps = eco.staticProps<PostProps>(async ({ pathname }) => ({
	props: { slug: String(pathname.params.slug) },
}));
export const getMetadata = eco.metadata<PostProps>(({ props }) => ({ title: props.slug }));

const PostPage: EcoComponent<PageProps<PostProps>> = ({ slug }) => <h1>{slug}</h1>;

export default PostPage;
