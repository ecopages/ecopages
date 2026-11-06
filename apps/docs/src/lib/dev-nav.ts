import { entries } from 'ecopages:content/dev';
import { compareDevEntries, DEV_ROOT, type DevContentEntry } from '@/content/dev';
import { coreIcon } from '@/content/docs/section-icons';
import type { DocsNav } from '@/lib/content-nav';

/**
 * @remarks Fallback `ecopages:content/*` types use untyped frontmatter until collection generate runs.
 */
export const devEntries = [...entries].map((entry) => entry as DevContentEntry).sort(compareDevEntries);

/** Sidebar for the developer area: one Architecture section: the `/dev` overview, then every page in `src/content/dev`. */
export const devNav: DocsNav = {
	rootDir: DEV_ROOT,
	sections: [
		{
			id: 'architecture',
			title: 'Architecture',
			icon: coreIcon,
			items: [
				{ title: 'Overview', href: DEV_ROOT, section: 'architecture', slug: '' },
				...devEntries.map((entry) => ({
					title: entry.title,
					href: `${DEV_ROOT}/${entry.slug}`,
					section: 'architecture',
					slug: entry.slug,
				})),
			],
		},
	],
};
