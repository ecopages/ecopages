import { resolveDocsNavPage } from './resolve-docs-nav-page';
import type { DocsMdxComponent } from '@/lib/docs-kit/mdx/docs-mdx.types';

/** Resolves a section/slug pair to its imported MDX content module. */
export function getDocsContent(section: string, slug: string): DocsMdxComponent {
	return resolveDocsNavPage(section, slug).content;
}
