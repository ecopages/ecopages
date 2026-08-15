import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { categoryFromSlug, WIKI_ROOT } from '@/content/wiki';
import { getWikiScanner, invalidateWikiCollectionCache, resolveWikiContentRoot } from '@/lib/wiki/collection';
import { createSearchIndex, type SearchDocument, type SearchOptions } from './engine';

export type WikiSearchDocument = SearchDocument & { category: string };

export const WIKI_SEARCH_INDEX_FILENAME = 'search-index.json';

type WikiSearchOptions = {
	/** Absolute path to `src/content/wiki`. Defaults to `$cwd/src/content/wiki`. */
	contentRoot?: string;
};

let activeContentRoot: string | undefined;
let indexPromise: Promise<ReturnType<typeof createSearchIndex<WikiSearchDocument>>> | undefined;
let documentsPromise: Promise<WikiSearchDocument[]> | undefined;

function resetCacheIfRootChanged(contentRoot: string): void {
	if (activeContentRoot === contentRoot) {
		return;
	}
	activeContentRoot = contentRoot;
	indexPromise = undefined;
	documentsPromise = undefined;
}

function stripFrontmatter(raw: string): string {
	if (!raw.startsWith('---')) {
		return raw;
	}
	const end = raw.indexOf('\n---', 3);
	if (end === -1) {
		return raw;
	}
	return raw.slice(end + 4).trim();
}

async function loadWikiDocuments(contentRoot: string): Promise<WikiSearchDocument[]> {
	const scanner = getWikiScanner(contentRoot);
	const manifest = await scanner.getManifest();
	return Promise.all(
		manifest.map(async (entry) => ({
			id: entry.slug,
			title: entry.title,
			category: categoryFromSlug(entry.slug),
			url: `${WIKI_ROOT}/${entry.slug}`,
			content: stripFrontmatter(await scanner.getRawContent(entry.slug)),
		})),
	);
}

async function getWikiDocuments(contentRoot: string): Promise<WikiSearchDocument[]> {
	resetCacheIfRootChanged(contentRoot);
	if (!documentsPromise) {
		documentsPromise = loadWikiDocuments(contentRoot);
	}
	return documentsPromise;
}

/** Clears cached documents/index so the next search or index write picks up wiki changes. */
export function invalidateWikiSearchCache(): void {
	indexPromise = undefined;
	documentsPromise = undefined;
	activeContentRoot = undefined;
	invalidateWikiCollectionCache();
}

/**
 * Writes the wiki search corpus as JSON for static/preview clients.
 *
 * @remarks
 * `pnpm preview` serves static files only — `/api/search` is unavailable there.
 * The SearchBox loads this file and runs {@link createSearchIndex} in the browser.
 */
export async function writeWikiSearchIndex(directory: string, options: WikiSearchOptions = {}): Promise<string> {
	const contentRoot = resolveWikiContentRoot(options.contentRoot);
	invalidateWikiSearchCache();
	const documents = await getWikiDocuments(contentRoot);
	await mkdir(directory, { recursive: true });
	const filePath = path.join(directory, WIKI_SEARCH_INDEX_FILENAME);
	await writeFile(filePath, `${JSON.stringify(documents)}\n`, 'utf8');
	return filePath;
}

export function searchWiki(query: string, options?: SearchOptions & WikiSearchOptions) {
	const contentRoot = resolveWikiContentRoot(options?.contentRoot);
	resetCacheIfRootChanged(contentRoot);
	if (!indexPromise) {
		indexPromise = getWikiDocuments(contentRoot).then((documents) => createSearchIndex(documents));
	}
	return indexPromise.then((index) => index.search(query, options));
}
