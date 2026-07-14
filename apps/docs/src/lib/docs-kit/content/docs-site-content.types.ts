import type { JsxRenderable } from '@ecopages/jsx';
import type { DocsMdxComponent } from '@/lib/docs-kit/mdx/docs-mdx.types';

export type DocsContentPageMeta = {
	slug: string;
	title: string;
	description: string;
	llms?: boolean;
};

export type DocsContentPage = DocsContentPageMeta & {
	content: DocsMdxComponent;
};

export type DocsContentSectionMeta = {
	id: string;
	title: string;
	icon?: JsxRenderable;
	pages: DocsContentPageMeta[];
};

export type DocsContentSection = Omit<DocsContentSectionMeta, 'pages'> & {
	pages: DocsContentPage[];
};

/** Navigation, metadata, icons, and MDX modules for the docs site. */
export type DocsSiteContent = {
	rootDir: string;
	sections: DocsContentSection[];
};
