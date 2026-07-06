import type { DocsMdxComponent } from '@/docs-kit/mdx/docs-mdx.types';
import { resolveDocsNavPage } from './resolve-docs-nav-page';

export type ResolvedDocsPage = {
	section: string;
	slug: string;
	title: string;
	description: string;
	llms?: boolean;
	content: DocsMdxComponent;
};

export function resolveDocsPage(section: string, slug: string): ResolvedDocsPage {
	const page = resolveDocsNavPage(section, slug);

	return {
		section,
		slug,
		title: page.title,
		description: page.description,
		llms: page.llms,
		content: page.content,
	};
}
