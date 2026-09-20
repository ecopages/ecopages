import { access, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { isEnoent } from './is-enoent';
import {
	lintOrphanPages,
	lintPageRecipePaths,
	lintPageSources,
	lintPageWikiLinks,
	lintSortspecGhosts,
	lintUncitedSources,
} from './lint-page';
import { loadVaultPages, readSortspec, SORTSPEC_FILENAME, type CategoryMode } from './vault';

export type WikiLintCode =
	'broken-link' | 'missing-source' | 'recipe-path' | 'orphan' | 'uncited-source' | 'sortspec-ghost';

export type WikiLintFinding = {
	code: WikiLintCode;
	severity: 'error' | 'warning';
	page?: string;
	message: string;
	target?: string;
};

export type WikiLintOptions = {
	wikiDir: string;
	sourcesDir: string;
	wikiRoot: string;
	categoryMode?: CategoryMode;
	homeSlug?: string;
};

export type WikiLintResult = {
	findings: WikiLintFinding[];
};

async function listSourceNames(sourcesDir: string): Promise<string[]> {
	try {
		const entries = await readdir(sourcesDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
			.map((entry) => basename(entry.name, '.md'));
	} catch (error) {
		if (isEnoent(error)) {
			return [];
		}
		throw error;
	}
}

async function missingRelativePath(wikiRoot: string, relativePath: string): Promise<boolean> {
	try {
		await access(join(wikiRoot, relativePath));
		return false;
	} catch (error) {
		if (isEnoent(error)) {
			return true;
		}
		throw error;
	}
}

/** Vault graph lint. Does not re-validate frontmatter or rewrite files. */
export async function lintWiki(options: WikiLintOptions): Promise<WikiLintResult> {
	const categoryMode = options.categoryMode ?? 'auto';
	const { layout, pages } = await loadVaultPages(options.wikiDir, categoryMode);
	const slugs = new Set(pages.map((page) => page.slug));
	const sourceNames = await listSourceNames(options.sourcesDir);
	const sourceSet = new Set(sourceNames);
	const citedSources = new Set<string>();
	const inbound = new Map<string, number>(pages.map((page) => [page.slug, 0]));
	const findings: WikiLintFinding[] = [];

	for (const page of pages) {
		for (const source of lintPageSources(page, sourceSet, findings)) {
			citedSources.add(source);
		}

		await lintPageRecipePaths(page, options.wikiRoot, missingRelativePath, findings);
		lintPageWikiLinks(page, slugs, inbound, findings);
	}

	lintOrphanPages(pages, inbound, options.homeSlug, findings);
	lintUncitedSources(sourceNames, citedSources, findings);
	await lintSortspecGhosts(options.wikiDir, layout, pages, readSortspec, SORTSPEC_FILENAME, findings);

	return { findings };
}
