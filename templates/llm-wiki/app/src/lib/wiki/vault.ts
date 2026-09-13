import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { VFile } from 'vfile';
import { matter } from 'vfile-matter';
import { wikiIdentifierSchema, wikiSourceFrontmatterSchema } from '../../content/wiki';
import { logger } from '../logger';
import { isEnoent } from './is-enoent';

export const SORTSPEC_FILENAME = 'sortspec.md';
const SORTSPEC_KEY = 'sorting-spec';

export type VaultLayout = 'frontmatter' | 'directory';
export type CategoryMode = 'auto' | 'frontmatter' | 'directory';

export type DiscoveredPage = {
	category?: string;
	filePath: string;
	sourceName: string;
};

export type VaultPage = {
	category: string;
	slug: string;
	title: string;
	summary: string;
	sources: string[];
	paths: string[];
	updated: string;
	order?: number;
	body: string;
	filePath: string;
	sourceName: string;
};

async function directoryPages(sourceDir: string): Promise<DiscoveredPage[]> {
	const entries = await readdir(sourceDir, { withFileTypes: true });
	const pages: DiscoveredPage[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith('.')) {
			continue;
		}

		const category = wikiIdentifierSchema.safeParse(entry.name);
		if (!category.success) {
			throw new Error(`Invalid category directory "${entry.name}": ${category.error.message}`);
		}

		const categoryDir = join(sourceDir, entry.name);
		const categoryEntries = await readdir(categoryDir, { withFileTypes: true });
		for (const file of categoryEntries) {
			if (!file.isFile() || !file.name.endsWith('.md') || file.name === SORTSPEC_FILENAME) {
				continue;
			}

			pages.push({
				category: entry.name,
				filePath: join(categoryDir, file.name),
				sourceName: `${entry.name}/${file.name}`,
			});
		}
	}

	return pages;
}

async function frontmatterPages(sourceDir: string): Promise<DiscoveredPage[]> {
	const entries = await readdir(sourceDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== SORTSPEC_FILENAME)
		.map((entry) => ({
			filePath: join(sourceDir, entry.name),
			sourceName: entry.name,
		}));
}

/**
 * @remarks
 * Returns file paths only. Frontmatter is read by {@link loadVaultPages}.
 */
export async function discoverVaultPages(
	sourceDir: string,
	categoryMode: CategoryMode,
): Promise<{ layout: VaultLayout; pages: DiscoveredPage[] }> {
	if (categoryMode === 'auto') {
		const [directory, frontmatter] = await Promise.all([directoryPages(sourceDir), frontmatterPages(sourceDir)]);
		if (directory.length > 0 && frontmatter.length > 0) {
			throw new Error(
				`Ambiguous wiki layout in ${sourceDir}: found both category directories and flat markdown files. Set WIKI_CATEGORY_MODE explicitly.`,
			);
		}
		if (directory.length > 0) {
			return { layout: 'directory', pages: directory };
		}
		if (frontmatter.length > 0) {
			return { layout: 'frontmatter', pages: frontmatter };
		}
		throw new Error(`No wiki markdown pages found in ${sourceDir}`);
	}

	const attempts: VaultLayout[] =
		categoryMode === 'directory' ? ['directory', 'frontmatter'] : ['frontmatter', 'directory'];

	for (const layout of attempts) {
		const pages = layout === 'directory' ? await directoryPages(sourceDir) : await frontmatterPages(sourceDir);
		if (pages.length > 0) {
			if (layout !== categoryMode) {
				logger.warn(
					`WIKI_CATEGORY_MODE=${categoryMode} did not match ${sourceDir}; using ${layout} layout instead`,
				);
			}
			return { layout, pages };
		}
	}

	throw new Error(`No wiki pages found in ${sourceDir} as ${attempts.join(' or ')} layout`);
}

function parseSourcePage(raw: string, sourceName: string) {
	const file = new VFile({ value: raw });
	matter(file, { strip: true });
	const parsed = wikiSourceFrontmatterSchema.safeParse(file.data.matter);
	if (!parsed.success) {
		throw new Error(`Invalid frontmatter in ${sourceName}: ${parsed.error.message}`);
	}
	return { body: String(file), frontmatter: parsed.data };
}

function pageSlug(sourceName: string): string {
	const slug = basename(sourceName, '.md');
	const parsed = wikiIdentifierSchema.safeParse(slug);
	if (!parsed.success) {
		throw new Error(`Invalid page slug "${slug}" in ${sourceName}: ${parsed.error.message}`);
	}
	return slug;
}

async function loadOnePage(page: DiscoveredPage, layout: VaultLayout): Promise<VaultPage> {
	const raw = await readFile(page.filePath, 'utf8');
	const { body, frontmatter } = parseSourcePage(raw, page.sourceName);
	const category = page.category ?? frontmatter.category;
	const categoryResult = wikiIdentifierSchema.safeParse(category);
	if (!categoryResult.success) {
		throw new Error(`Invalid category in ${page.sourceName}: ${categoryResult.error.message}`);
	}
	const normalizedCategory = categoryResult.data;
	if (layout === 'frontmatter' && !frontmatter.category) {
		throw new Error(`Missing required "category" frontmatter field in ${page.sourceName}`);
	}

	const slug = pageSlug(page.sourceName);
	const fullSlug = `${normalizedCategory}/${slug}`;

	return {
		category: normalizedCategory,
		slug: fullSlug,
		title: frontmatter.title,
		summary: frontmatter.summary,
		sources: frontmatter.sources ?? [],
		paths: frontmatter.paths ?? [],
		updated: frontmatter.updated,
		order: frontmatter.order,
		body,
		filePath: page.filePath,
		sourceName: page.sourceName,
	};
}

/**
 * @remarks
 * Validates identifiers, frontmatter, and unique slugs. Graph lint does not
 * repeat this schema work.
 */
export async function loadVaultPages(
	sourceDir: string,
	categoryMode: CategoryMode,
): Promise<{ layout: VaultLayout; pages: VaultPage[] }> {
	const { layout, pages: discovered } = await discoverVaultPages(sourceDir, categoryMode);
	const pages = await Promise.all(discovered.map((page) => loadOnePage(page, layout)));
	const seenSlugs = new Set<string>();
	for (const page of pages) {
		if (seenSlugs.has(page.slug)) {
			throw new Error(`Duplicate wiki slug: ${page.slug}`);
		}
		seenSlugs.add(page.slug);
	}
	return { layout, pages };
}

/**
 * @remarks
 * Parses the Obsidian Custom Sort `sorting-spec` field into non-empty lines.
 */
export async function readSortspec(path: string): Promise<string[]> {
	try {
		const file = new VFile({ value: await readFile(path, 'utf8') });
		matter(file, { strip: true });
		const spec = (file.data.matter as Record<string, unknown>)[SORTSPEC_KEY];
		return typeof spec === 'string'
			? spec
					.split('\n')
					.map((line) => line.trim())
					.filter(Boolean)
			: [];
	} catch (error) {
		if (isEnoent(error)) {
			return [];
		}
		throw error;
	}
}

export type VaultSortOrder = {
	categories: string[];
	pages: Record<string, string[]>;
};

/**
 * @remarks
 * Same category and page-title order the sidebar uses (`sortspec`, then title).
 */
export async function resolveVaultSortOrder(options: {
	layout: VaultLayout;
	sourceDir: string;
	pages: Array<{ category: string; title: string; order?: number }>;
}): Promise<VaultSortOrder> {
	const discoveredCategories = [...new Set(options.pages.map((page) => page.category))];
	const rootOrder = await readSortspec(join(options.sourceDir, SORTSPEC_FILENAME));
	const categorySet = new Set(rootOrder);
	const categories = [
		...rootOrder.filter((category) => discoveredCategories.includes(category)),
		...discoveredCategories.filter((category) => !categorySet.has(category)).sort(),
	];
	const pageOrders = await Promise.all(
		categories.map(async (category) => {
			const categoryPages = options.pages.filter((page) => page.category === category);
			const explicitOrder =
				options.layout === 'directory'
					? await readSortspec(join(options.sourceDir, category, SORTSPEC_FILENAME))
					: categoryPages
							.slice()
							.sort(
								(a, b) =>
									(a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
									a.title.localeCompare(b.title),
							)
							.map((page) => page.title);
			return [category, explicitOrder] as const;
		}),
	);
	const pages: Record<string, string[]> = {};
	for (const [category, explicitOrder] of pageOrders) {
		if (explicitOrder.length > 0) {
			pages[category] = explicitOrder;
		}
	}

	return { categories, pages };
}

/**
 * @remarks
 * Always the sibling of `wiki/` (`../index.md` from the vault directory).
 */
export function resolveWikiIndexPath(wikiDir: string): string {
	return join(wikiDir, '..', 'index.md');
}
