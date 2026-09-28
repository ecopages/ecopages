import { join } from 'node:path';
import { extractWikiMarkdownLinkHrefs, resolveWikiLinkTarget } from './links';
import type { WikiLintFinding } from './lint';
import type { VaultPage } from './vault';

export function vaultPagePath(page: VaultPage): string {
	return `wiki/${page.sourceName}`;
}

export function lintPageSources(page: VaultPage, sourceSet: Set<string>, findings: WikiLintFinding[]): Set<string> {
	const citedSources = new Set<string>();

	for (const source of page.sources) {
		citedSources.add(source);
		if (!sourceSet.has(source)) {
			findings.push({
				code: 'missing-source',
				severity: 'error',
				page: vaultPagePath(page),
				message: `frontmatter sources lists missing file sources/${source}.md`,
				target: source,
			});
		}
	}

	return citedSources;
}

export async function lintPageRecipePaths(
	page: VaultPage,
	wikiRoot: string,
	missingRelativePath: (wikiRoot: string, relativePath: string) => Promise<boolean>,
	findings: WikiLintFinding[],
): Promise<void> {
	if (page.category === 'recipe' && page.paths.length === 0) {
		findings.push({
			code: 'recipe-path',
			severity: 'error',
			page: vaultPagePath(page),
			message: 'recipe page has no paths',
		});
	}

	for (const relativePath of page.paths) {
		if (await missingRelativePath(wikiRoot, relativePath)) {
			findings.push({
				code: 'recipe-path',
				severity: 'error',
				page: vaultPagePath(page),
				message: `path does not exist: ${relativePath}`,
				target: relativePath,
			});
		}
	}
}

export function lintPageWikiLinks(
	page: VaultPage,
	slugs: Set<string>,
	inbound: Map<string, number>,
	findings: WikiLintFinding[],
): void {
	for (const href of extractWikiMarkdownLinkHrefs(page.body)) {
		const target = resolveWikiLinkTarget(href, page.category);
		if (!target) {
			continue;
		}
		if (!slugs.has(target)) {
			findings.push({
				code: 'broken-link',
				severity: 'error',
				page: vaultPagePath(page),
				message: `broken wiki link ${href}`,
				target,
			});
			continue;
		}
		inbound.set(target, (inbound.get(target) ?? 0) + 1);
	}
}

export function lintOrphanPages(
	pages: VaultPage[],
	inbound: Map<string, number>,
	homeSlug: string | undefined,
	findings: WikiLintFinding[],
): void {
	for (const page of pages) {
		if ((inbound.get(page.slug) ?? 0) > 0) {
			continue;
		}
		if (homeSlug && page.slug === homeSlug) {
			continue;
		}
		findings.push({
			code: 'orphan',
			severity: 'error',
			page: vaultPagePath(page),
			message: 'no inbound wiki links',
		});
	}
}

export function lintUncitedSources(
	sourceNames: string[],
	citedSources: Set<string>,
	findings: WikiLintFinding[],
): void {
	for (const source of sourceNames) {
		if (!citedSources.has(source)) {
			findings.push({
				code: 'uncited-source',
				severity: 'warning',
				page: `sources/${source}.md`,
				message: 'source file is not listed on any page',
				target: source,
			});
		}
	}
}

export async function lintSortspecGhosts(
	wikiDir: string,
	layout: string,
	pages: VaultPage[],
	readSortspec: (path: string) => Promise<string[]>,
	sortspecFilename: string,
	findings: WikiLintFinding[],
): Promise<void> {
	const discoveredCategories = new Set(pages.map((page) => page.category));
	const rootOrder = await readSortspec(join(wikiDir, sortspecFilename));
	for (const category of rootOrder) {
		if (!discoveredCategories.has(category)) {
			findings.push({
				code: 'sortspec-ghost',
				severity: 'warning',
				page: `wiki/${sortspecFilename}`,
				message: `sortspec lists unknown category ${category}`,
				target: category,
			});
		}
	}

	if (layout !== 'directory') {
		return;
	}

	const categorySortspecs = await Promise.all(
		[...discoveredCategories].map(async (category) => {
			const titles = new Set(pages.filter((page) => page.category === category).map((page) => page.title));
			const explicit = await readSortspec(join(wikiDir, category, sortspecFilename));
			return { category, titles, explicit };
		}),
	);
	for (const { category, titles, explicit } of categorySortspecs) {
		for (const title of explicit) {
			if (!titles.has(title)) {
				findings.push({
					code: 'sortspec-ghost',
					severity: 'warning',
					page: `wiki/${category}/${sortspecFilename}`,
					message: `sortspec lists unknown title ${title}`,
					target: title,
				});
			}
		}
	}
}
