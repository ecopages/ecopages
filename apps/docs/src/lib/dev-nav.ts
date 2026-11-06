import { entries } from 'ecopages:content/dev';
import {
	compareDevEntries,
	DEV_INDEX_SLUG,
	DEV_SECTION_ORDER,
	DEV_SECTION_TITLES,
	DEV_ROOT,
	devEntryHref,
	type DevContentEntry,
} from '@/content/dev';
import {
	coreIcon,
	integrationsIcon,
	pluginsIcon,
	recipesIcon,
	serverIcon,
	referenceIcon,
} from '@/content/docs/section-icons';
import type { DocsNav } from '@/lib/content-nav';
import type { JsxRenderable } from '@ecopages/jsx';

/**
 * @remarks Fallback `ecopages:content/*` types use untyped frontmatter until collection generate runs.
 */
export const devEntries = [...entries].map((entry) => entry as DevContentEntry).sort(compareDevEntries);

const SECTION_ICONS: Record<(typeof DEV_SECTION_ORDER)[number], JsxRenderable> = {
	overview: coreIcon,
	build: serverIcon,
	rendering: integrationsIcon,
	development: referenceIcon,
	hmr: recipesIcon,
	packages: pluginsIcon,
};

/** Sidebar for the developer area: one section per `section` frontmatter value, entries in `order`. */
export const devNav: DocsNav = {
	rootDir: DEV_ROOT,
	sections: DEV_SECTION_ORDER.flatMap((sectionId) => {
		const items = devEntries
			.filter((entry) => entry.section === sectionId)
			.map((entry) => ({
				title: entry.title,
				href: devEntryHref(entry.slug),
				section: sectionId,
				slug: entry.slug === DEV_INDEX_SLUG ? '' : entry.slug,
			}));

		return items.length === 0
			? []
			: [{ id: sectionId, title: DEV_SECTION_TITLES[sectionId], icon: SECTION_ICONS[sectionId], items }];
	}),
};
