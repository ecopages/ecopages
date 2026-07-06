import type { JsxRenderable } from '@ecopages/jsx';
import type { DocsMdxComponent } from '@/docs-kit/mdx/docs-mdx.types';

export type DocsContentPage = {
	slug: string;
	title: string;
	description: string;
	llms?: boolean;
	content: DocsMdxComponent;
};

export type DocsContentSection = {
	id: string;
	title: string;
	icon?: JsxRenderable;
	pages: DocsContentPage[];
};

export type DocsSiteContent = {
	rootDir: string;
	sections: DocsContentSection[];
};
