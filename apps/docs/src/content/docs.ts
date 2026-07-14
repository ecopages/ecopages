import type { ContentEntry } from '@ecopages/content-processor/types';
import { z } from 'zod';

import {
	coreIcon,
	ecosystemIcon,
	gettingStartedIcon,
	integrationsIcon,
	pluginsIcon,
	referenceIcon,
	serverIcon,
} from './docs/section-icons';
import type { JsxRenderable } from '@ecopages/jsx';

/** Public URL prefix for docs pages. */
export const DOCS_ROOT = '/docs';

export const DOCS_SECTION_ORDER = [
	'getting-started',
	'core',
	'server',
	'integrations',
	'ecosystem',
	'plugins',
	'reference',
] as const;

export type DocsSectionId = (typeof DOCS_SECTION_ORDER)[number];

export const DOCS_SECTION_ORDER_INDEX = new Map<string, number>(
	DOCS_SECTION_ORDER.map((section, index) => [section, index]),
);

/** Preferred section order for `llms.txt`. */
export const LLM_SECTION_ORDER = [...DOCS_SECTION_ORDER] as const;

export const DOCS_SECTION_CONFIG: Record<
	DocsSectionId,
	{
		title: string;
		icon: JsxRenderable;
	}
> = {
	'getting-started': { title: 'Getting Started', icon: gettingStartedIcon },
	core: { title: 'Core Concepts', icon: coreIcon },
	server: { title: 'Server', icon: serverIcon },
	integrations: { title: 'Integrations', icon: integrationsIcon },
	ecosystem: { title: 'Ecosystem', icon: ecosystemIcon },
	plugins: { title: 'Extending', icon: pluginsIcon },
	reference: { title: 'Reference', icon: referenceIcon },
};

export const docsFrontmatterSchema = z.object({
	title: z.string(),
	description: z.string(),
	order: z.coerce.number().optional(),
	llms: z.boolean().optional(),
});

export type DocsFrontmatter = z.infer<typeof docsFrontmatterSchema>;

export type DocsContentEntry = ContentEntry<DocsFrontmatter>;

/** Sorts entries by configured section order, then frontmatter `order`. */
export function compareDocsEntries(a: DocsContentEntry, b: DocsContentEntry): number {
	const sectionA = DOCS_SECTION_ORDER_INDEX.get(a.segments[0] ?? '') ?? Number.MAX_SAFE_INTEGER;
	const sectionB = DOCS_SECTION_ORDER_INDEX.get(b.segments[0] ?? '') ?? Number.MAX_SAFE_INTEGER;

	if (sectionA !== sectionB) {
		return sectionA - sectionB;
	}

	return (a.order ?? 0) - (b.order ?? 0);
}
