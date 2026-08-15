import path from 'node:path';
import { ContentScanner } from '@ecopages/content-processor';
import { compareWikiEntries, wikiFrontmatterSchema } from '@/content/wiki';
import { WIKI_ROOT } from '@/content/wiki';
import { env } from '@/lib/env';

/**
 * @remarks
 * Do not resolve from `import.meta.dirname` — this module is bundled into
 * `dist/.server/app.mjs`, where dirname no longer points at `src/lib`.
 */
export function resolveWikiContentRoot(contentRoot?: string): string {
	return contentRoot ?? path.join(process.cwd(), 'src/content/wiki');
}

export function createWikiScanner(contentRoot: string) {
	return new ContentScanner({
		contentRoot,
		schema: wikiFrontmatterSchema,
		orderBy: compareWikiEntries,
	});
}

let activeContentRoot: string | undefined;
let scanner: ReturnType<typeof createWikiScanner> | undefined;

export function getWikiScanner(contentRoot?: string): ReturnType<typeof createWikiScanner> {
	const root = resolveWikiContentRoot(contentRoot);
	if (scanner && activeContentRoot === root) {
		return scanner;
	}
	activeContentRoot = root;
	scanner = createWikiScanner(root);
	return scanner;
}

/** Clears the cached content scanner so the next read picks up wiki changes. */
export function invalidateWikiCollectionCache(): void {
	scanner = undefined;
	activeContentRoot = undefined;
}

/** Synced markdown body for `slug`, or `null` when the entry does not exist. */
export async function getWikiRawContent(slug: string, contentRoot?: string): Promise<string | null> {
	try {
		return await getWikiScanner(contentRoot).getRawContent(slug);
	} catch {
		return null;
	}
}

/** Resolves the configured home entry, or the first canonically ordered entry. */
export async function getWikiHomePath(): Promise<string> {
	const entries = await getWikiScanner().getManifest();
	const configuredSlug = env.WIKI_HOME_SLUG;
	const entry = configuredSlug ? entries.find((candidate) => candidate.slug === configuredSlug) : entries[0];

	if (!entry) {
		throw new Error(
			configuredSlug
				? `WIKI_HOME_SLUG does not match an ingested wiki page: ${configuredSlug}`
				: 'No wiki pages were ingested; cannot determine the wiki home page',
		);
	}

	return `${WIKI_ROOT}/${entry.slug}`;
}
