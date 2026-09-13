import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { renderCatalogMarkdown, writeCatalogIndex } from './catalog';
import { isEnoent } from './is-enoent';
import { rewriteWikiMarkdownLinks } from './links';
import { loadVaultPages, resolveVaultSortOrder, resolveWikiIndexPath, type VaultPage } from './vault';

export type IngestVaultOptions = {
	appRoot?: string;
	sourceDir?: string;
	outputDir?: string;
};

/** Resolves the wiki source directory from the `WIKI_DIR` environment variable. */
export function resolveVaultDir(_appRoot: string): string {
	return env.WIKI_DIR;
}

export function resolveContentOutputDir(appRoot: string): string {
	return join(appRoot, 'src/content/wiki');
}

/** Static markdown alternates consumed by `preview` and static hosting. */
export function resolvePublicWikiDir(appRoot: string): string {
	return join(appRoot, 'src/public/wiki');
}

/** Resolves the sources directory from the `SOURCES_DIR` environment variable. */
export function resolveSourcesDir(_appRoot: string): string {
	return env.SOURCES_DIR;
}

export function resolveSourcesOutputDir(appRoot: string): string {
	return join(appRoot, 'src/public/sources');
}

function generatedPageMarkdown(page: VaultPage): string {
	const frontmatter = [
		'---',
		`title: ${JSON.stringify(page.title)}`,
		`category: ${JSON.stringify(page.category)}`,
		`summary: ${JSON.stringify(page.summary)}`,
		`sources: ${JSON.stringify(page.sources)}`,
		`paths: ${JSON.stringify(page.paths)}`,
		`updated: ${JSON.stringify(page.updated)}`,
	];
	if (page.order !== undefined) {
		frontmatter.push(`order: ${JSON.stringify(page.order)}`);
	}
	return [...frontmatter, '---', '', rewriteWikiMarkdownLinks(page.body, page.category)].join('\n');
}

async function writeGeneratedPage(page: VaultPage, outputDir: string, publicWikiDir: string): Promise<void> {
	const slug = page.slug.slice(page.slug.indexOf('/') + 1);
	const outputCategoryDir = join(outputDir, page.category);
	const publicCategoryDir = join(publicWikiDir, page.category);
	await mkdir(outputCategoryDir, { recursive: true });
	await mkdir(publicCategoryDir, { recursive: true });
	const output = generatedPageMarkdown(page);
	await Promise.all([
		writeFile(join(outputCategoryDir, `${slug}.mdx`), output, 'utf8'),
		writeFile(join(publicCategoryDir, `${slug}.md`), output, 'utf8'),
	]);
}

/**
 * Synchronizes one supported source layout into Ecopages' canonical wiki collection.
 *
 * @remarks
 * Layout detection is intentionally separate from page materialization: flat and
 * directory vaults differ only in where their category comes from. Ingest also
 * rewrites the vault-root `index.md` catalog from page `summary` fields and
 * writes `/wiki/<category>/<page>.md` into `src/public/wiki` for static preview.
 */
export async function ingestVault(options: IngestVaultOptions = {}): Promise<void> {
	const appRoot = options.appRoot ?? process.cwd();
	const sourceDir = options.sourceDir ?? resolveVaultDir(appRoot);
	const outputDir = options.outputDir ?? resolveContentOutputDir(appRoot);
	const publicWikiDir = resolvePublicWikiDir(appRoot);
	const { layout, pages } = await loadVaultPages(sourceDir, env.WIKI_CATEGORY_MODE);

	await Promise.all([
		rm(outputDir, { recursive: true, force: true }),
		rm(publicWikiDir, { recursive: true, force: true }),
	]);
	await Promise.all([mkdir(outputDir, { recursive: true }), mkdir(publicWikiDir, { recursive: true })]);

	await Promise.all(pages.map((page) => writeGeneratedPage(page, outputDir, publicWikiDir)));

	const sortOrder = await resolveVaultSortOrder({ layout, sourceDir, pages });
	await writeFile(
		join(outputDir, '..', 'wiki-sort-order.json'),
		`${JSON.stringify(sortOrder, null, '\t')}\n`,
		'utf8',
	);

	const catalogMarkdown = renderCatalogMarkdown({
		categories: sortOrder.categories,
		pagesByTitle: sortOrder.pages,
		entries: pages,
	});
	const wroteCatalog = await writeCatalogIndex(resolveWikiIndexPath(sourceDir), catalogMarkdown);
	if (wroteCatalog) {
		logger.info(`Updated catalog ${resolveWikiIndexPath(sourceDir)}`);
	}

	await copySources({ appRoot });
	logger.info(`${pages.length} page(s) (${layout}) from ${sourceDir} -> ${outputDir}`);
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

	let entries;
	try {
		entries = await readdir(sourcesDir, { withFileTypes: true });
	} catch (error) {
		if (isEnoent(error)) {
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
