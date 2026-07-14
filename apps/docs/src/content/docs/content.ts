import type { DocsSiteContent } from '@/lib/docs-kit/content/docs-site-content.types';

import { attachDocsContentModules } from './attach-docs-content-modules';
import { docsSiteContentMeta } from './content.meta';

/** Docs navigation, metadata, icons, and MDX modules — single source of truth. */
export const docsSiteContent = attachDocsContentModules(docsSiteContentMeta) satisfies DocsSiteContent;

export { docsSiteContentMeta } from './content.meta';
