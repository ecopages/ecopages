import { z } from 'zod';

/**
 * Docs MDX frontmatter schema.
 *
 * @remarks
 * Page title and description live in `content.meta.ts` today. The processor
 * validates an empty frontmatter block so existing ceremony-free MDX keeps working.
 */
export const docsContentSchema = z.object({});

export type DocsContentFrontmatter = z.infer<typeof docsContentSchema>;
