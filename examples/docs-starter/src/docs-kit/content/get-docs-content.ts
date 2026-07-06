import { resolveDocsNavPage } from './resolve-docs-nav-page';
import type { DocsMdxComponent } from '@/docs-kit/mdx/docs-mdx.types';

export function getDocsContent(section: string, slug: string): DocsMdxComponent {
	return resolveDocsNavPage(section, slug).content;
}
