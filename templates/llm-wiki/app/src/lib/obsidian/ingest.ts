import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { VFile } from 'vfile';
import { matter } from 'vfile-matter';
import { wikiIdentifierSchema, wikiSourceFrontmatterSchema } from '@/content/wiki';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { rewriteWikiMarkdownLinks } from './links';

const SORTSPEC_FILENAME = 'sortspec.md';
const SORTSPEC_KEY = 'sorting-spec';

type VaultLayout = 'frontmatter' | 'directory';

type DiscoveredPage = {
	category?: string;
	filePath: string;
	sourceName: string;
};

type IngestedPage = {
	category: string;
	order?: number;
	slug: string;
	title: string;
};

/** Resolves the wiki source directory from the `WIKI_DIR` environment variable. */
export function resolveVaultDir(_appRoot: string): string {
	return env.WIKI_DIR;
}

export function resolveContentOutputDir(appRoot: string): string {
	return join(appRoot, 'src/content/wiki');
}

/** Resolves the sources directory from the `SOURCES_DIR` environment variable. */
export function resolveSourcesDir(_appRoot: string): string {
	return env.SOURCES_DIR;
}

export function resolveSourcesOutputDir(appRoot: string): string {
	return join(appRoot, 'src/public/sources');
}

export type IngestVaultOptions = {
	appRoot?: string;
	sourceDir?: string;
	outputDir?: string;
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

async function discoverPages(sourceDir: string): Promise<{ layout: VaultLayout; pages: DiscoveredPage[] }> {
	if (env.WIKI_CATEGORY_MODE === 'auto') {
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
		env.WIKI_CATEGORY_MODE === 'directory' ? ['directory', 'frontmatter'] : ['frontmatter', 'directory'];

	for (const layout of attempts) {
		const pages = layout === 'directory' ? await directoryPages(sourceDir) : await frontmatterPages(sourceDir);
		if (pages.length > 0) {
			if (layout !== env.WIKI_CATEGORY_MODE) {
				logger.warn(
					`WIKI_CATEGORY_MODE=${env.WIKI_CATEGORY_MODE} did not match ${sourceDir}; using ${layout} layout instead`,
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

async function writePage(
	page: DiscoveredPage,
	layout: VaultLayout,
	outputDir: string,
	seenSlugs: Set<string>,
): Promise<IngestedPage> {
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
	if (seenSlugs.has(fullSlug)) {
		throw new Error(`Duplicate wiki slug: ${fullSlug}`);
	}
	seenSlugs.add(fullSlug);

	const outputCategoryDir = join(outputDir, normalizedCategory);
	await mkdir(outputCategoryDir, { recursive: true });
	const output = [
		'---',
		`title: ${JSON.stringify(frontmatter.title)}`,
		`category: ${JSON.stringify(normalizedCategory)}`,
		`sources: ${JSON.stringify(frontmatter.sources ?? [])}`,
		`updated: ${JSON.stringify(frontmatter.updated)}`,
		'---',
		'',
		rewriteWikiMarkdownLinks(body, normalizedCategory),
	].join('\n');
	await writeFile(join(outputCategoryDir, `${slug}.mdx`), output, 'utf8');

	return {
		category: normalizedCategory,
		order: frontmatter.order,
		slug: fullSlug,
		title: frontmatter.title,
	};
}

/**
 * Synchronizes one supported source layout into Ecopages' canonical wiki collection.
 *
 * @remarks
 * Layout detection is intentionally separate from page materialization: flat and
 * directory vaults differ only in where their category comes from.
 */
export async function ingestVault(options: IngestVaultOptions = {}): Promise<void> {
	const appRoot = options.appRoot ?? process.cwd();
	const sourceDir = options.sourceDir ?? resolveVaultDir(appRoot);
	const outputDir = options.outputDir ?? resolveContentOutputDir(appRoot);
	const { layout, pages } = await discoverPages(sourceDir);

	await rm(outputDir, { recursive: true, force: true });
	await mkdir(outputDir, { recursive: true });

	const seenSlugs = new Set<string>();
	const ingested: IngestedPage[] = [];
	for (const page of pages) {
		ingested.push(await writePage(page, layout, outputDir, seenSlugs));
	}

	await Promise.all([copySources({ appRoot }), writeSortOrder({ layout, outputDir, pages: ingested, sourceDir })]);
	logger.info(`${ingested.length} page(s) (${layout}) from ${sourceDir} -> ${outputDir}`);
}

export type CopySourcesOptions = {
	appRoot?: string;
	sourcesDir?: string;
	outputDir?: string;
};

/** Copies raw source markdown into public assets. */
export async function copySources(options: CopySourcesOptions = {}): Promise<void> {
	const appRoot = options.appRoot ?? process.cwd();
	const sourcesDir = options.sourcesDir ?? resolveSourcesDir(appRoot);
	const outputDir = options.outputDir ?? resolveSourcesOutputDir(appRoot);
	await rm(outputDir, { recursive: true, force: true });

	let entries: Awaited<ReturnType<typeof readdir>>;
	try {
		entries = await readdir(sourcesDir, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			logger.warn(`Sources directory not found, skipping copy: ${sourcesDir}`);
			return;
		}
		throw error;
	}
	const sourceFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'));

	await mkdir(outputDir, { recursive: true });
	await Promise.all(
		sourceFiles.map(async (entry) => {
			const content = await readFile(join(sourcesDir, entry.name), 'utf8');
			await writeFile(join(outputDir, entry.name), content, 'utf8');
		}),
	);
	logger.info(`${sourceFiles.length} source(s) from ${sourcesDir} -> ${outputDir}`);
}

type SortOrderOptions = {
	layout: VaultLayout;
	outputDir: string;
	pages: IngestedPage[];
	sourceDir: string;
};

async function readSortspec(path: string): Promise<string[]> {
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
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}
		throw error;
	}
}

async function writeSortOrder(options: SortOrderOptions): Promise<void> {
	const discoveredCategories = [...new Set(options.pages.map((page) => page.category))];
	const rootOrder = await readSortspec(join(options.sourceDir, SORTSPEC_FILENAME));
	const categorySet = new Set(rootOrder);
	const categories = [
		...rootOrder.filter((category) => discoveredCategories.includes(category)),
		...discoveredCategories.filter((category) => !categorySet.has(category)).sort(),
	];
	const pages: Record<string, string[]> = {};

	for (const category of categories) {
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
		if (explicitOrder.length > 0) {
			pages[category] = explicitOrder;
		}
	}

	await writeFile(
		join(options.outputDir, '..', 'wiki-sort-order.json'),
		JSON.stringify({ categories, pages }),
		'utf8',
	);
}
