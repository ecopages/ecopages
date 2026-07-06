import type { JsxRenderable } from '@ecopages/jsx';
import type { DocsMdxComponent } from '@/docs-kit/mdx/docs-mdx.types';

export type DocsContentPageMeta = {
	slug: string;
	title: string;
	description: string;
	llms?: boolean;
};

export type DocsContentSectionMeta = {
	id: string;
	title: string;
	icon?: JsxRenderable;
	pages: DocsContentPageMeta[];
};

export type DocsSiteContentMeta = {
	rootDir: string;
	sections: DocsContentSectionMeta[];
};

export type DocsContentPage = DocsContentPageMeta & {
	content: DocsMdxComponent;
};

export type DocsContentSection = Omit<DocsContentSectionMeta, 'pages'> & {
	pages: DocsContentPage[];
};

export type DocsSiteContent = {
	rootDir: string;
	sections: DocsContentSection[];
};
