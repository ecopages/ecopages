import { access, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { isEnoent } from './is-enoent';
import { extractWikiMarkdownLinkHrefs, resolveWikiLinkTarget } from './links';
import { loadVaultPages, readSortspec, SORTSPEC_FILENAME, type CategoryMode, type VaultPage } from './vault';

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

function vaultPagePath(page: VaultPage): string {
	return `wiki/${page.sourceName}`;
}

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

		if (page.category === 'recipe' && page.paths.length === 0) {
			findings.push({
				code: 'recipe-path',
				severity: 'error',
				page: vaultPagePath(page),
				message: 'recipe page has no paths',
			});
		}

		for (const relativePath of page.paths) {
			if (await missingRelativePath(options.wikiRoot, relativePath)) {
				findings.push({
					code: 'recipe-path',
					severity: 'error',
					page: vaultPagePath(page),
					message: `path does not exist: ${relativePath}`,
					target: relativePath,
				});
			}
		}

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

	for (const page of pages) {
		if ((inbound.get(page.slug) ?? 0) > 0) {
			continue;
		}
		if (options.homeSlug && page.slug === options.homeSlug) {
			continue;
		}
		findings.push({
			code: 'orphan',
			severity: 'error',
			page: vaultPagePath(page),
			message: 'no inbound wiki links',
		});
	}

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

	const discoveredCategories = new Set(pages.map((page) => page.category));
	const rootOrder = await readSortspec(join(options.wikiDir, SORTSPEC_FILENAME));
	for (const category of rootOrder) {
		if (!discoveredCategories.has(category)) {
			findings.push({
				code: 'sortspec-ghost',
				severity: 'warning',
				page: `wiki/${SORTSPEC_FILENAME}`,
				message: `sortspec lists unknown category ${category}`,
				target: category,
			});
		}
	}

	if (layout === 'directory') {
		const categorySortspecs = await Promise.all(
			[...discoveredCategories].map(async (category) => {
				const titles = new Set(pages.filter((page) => page.category === category).map((page) => page.title));
				const explicit = await readSortspec(join(options.wikiDir, category, SORTSPEC_FILENAME));
				return { category, titles, explicit };
			}),
		);
		for (const { category, titles, explicit } of categorySortspecs) {
			for (const title of explicit) {
				if (!titles.has(title)) {
					findings.push({
						code: 'sortspec-ghost',
						severity: 'warning',
						page: `wiki/${category}/${SORTSPEC_FILENAME}`,
						message: `sortspec lists unknown title ${title}`,
						target: title,
					});
				}
			}
		}
	}

	return { findings };
}
