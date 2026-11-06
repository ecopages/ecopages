/**
 * Fails when a change touches the code a developer page describes without touching that page.
 *
 * @remarks
 * Each page under `apps/docs/src/content/dev/` lists the code it describes in its `sources:`
 * frontmatter. A source ending in `/` covers every file below that directory; any other source
 * covers one file. Run `node --experimental-strip-types scripts/check-dev-pages.ts [base]`; the
 * base defaults to `origin/next` and the changed files come from `git diff <base>...HEAD`. Tests and
 * Markdown files do not count as changes, and a `main` base (a release) skips the check.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEV_PAGES_DIR = 'apps/docs/src/content/dev';

export type DevPage = { path: string; sources: string[] };

export type StalePage = { page: string; files: string[] };

export type DevPagesResult = { problems: string[]; stale: StalePage[] };

/**
 * Reads the `sources:` list from a page's YAML frontmatter.
 *
 * @remarks
 * Only the block-list form (`sources:` followed by `  - path` lines) is supported, which keeps the
 * check free of a YAML dependency. Entries may be single- or double-quoted.
 */
export function parseSources(source: string): string[] {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
	if (!frontmatter) {
		return [];
	}

	const lines = frontmatter.split(/\r?\n/);
	const start = lines.findIndex((line) => /^sources:\s*$/.test(line));
	if (start === -1) {
		return [];
	}

	const sources: string[] = [];
	for (const line of lines.slice(start + 1)) {
		const item = /^\s+-\s+(.+?)\s*$/.exec(line);
		if (!item) {
			break;
		}
		sources.push(item[1]!.replace(/^(['"])(.*)\1$/, '$2'));
	}
	return sources;
}

/**
 * Changes that never make a page wrong: tests and Markdown, such as a package README.
 */
const IGNORED_CHANGE = /(\.test\.tsx?|\.md)$/;

function covers(source: string, file: string): boolean {
	return source.endsWith('/') ? file.startsWith(source) : file === source;
}

/**
 * True for the release branch.
 *
 * @remarks
 * A release pull request from `next` into `main` carries every change already checked when it merged into
 * `next`, so checking it again would only flag pages that were updated in earlier pull requests.
 */
export function isReleaseBase(base: string): boolean {
	return base.replace(/^origin\//, '') === 'main';
}

/** Lists the pages whose sources changed while the page itself did not, with the files that matched; tests and Markdown do not count. */
export function findStalePages(pages: DevPage[], changedFiles: string[]): StalePage[] {
	const changed = new Set(changedFiles);
	return pages.flatMap((page) => {
		if (changed.has(page.path)) {
			return [];
		}
		const files = changedFiles.filter(
			(file) => !IGNORED_CHANGE.test(file) && page.sources.some((source) => covers(source, file)),
		);
		return files.length > 0 ? [{ page: page.path, files }] : [];
	});
}

/** Reads every `.mdx` page under `pagesDir`, with paths relative to `rootDir`. */
export function readDevPages(rootDir: string, pagesDir = DEV_PAGES_DIR): DevPage[] {
	return readdirSync(path.join(rootDir, pagesDir), { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.mdx'))
		.map((file) => path.posix.join(pagesDir, file.split(path.sep).join('/')))
		.sort()
		.map((pagePath) => ({
			path: pagePath,
			sources: parseSources(readFileSync(path.join(rootDir, pagePath), 'utf8')),
		}));
}

/**
 * Checks the pages against the changed files.
 *
 * @remarks
 * A source that no longer exists is a problem too: a rename would otherwise leave the page
 * covering nothing, and the check would pass forever.
 */
export function checkDevPages(rootDir: string, pages: DevPage[], changedFiles: string[]): DevPagesResult {
	const problems = pages.flatMap((page) => {
		if (page.sources.length === 0) {
			return [`${page.path} declares no sources.`];
		}
		return page.sources
			.filter((source) => !existsSync(path.join(rootDir, source)))
			.map((source) => `${page.path} lists a source that does not exist: ${source}`);
	});
	return { problems, stale: findStalePages(pages, changedFiles) };
}

/** Formats the failure message, or returns an empty string when there is nothing to report. */
export function formatReport({ problems, stale }: DevPagesResult): string {
	const lines: string[] = [];
	if (problems.length > 0) {
		lines.push('Developer page sources are invalid:', ...problems.map((problem) => `  ${problem}`));
	}
	if (stale.length > 0) {
		if (lines.length > 0) {
			lines.push('');
		}
		lines.push('This change touches code that a developer page describes, but not the page. Update:');
		for (const { page, files } of stale) {
			lines.push(`  ${page}`, ...files.map((file) => `    changed: ${file}`));
		}
		lines.push(
			'',
			'Update each page so it still describes the code, or add the `docs-not-needed` label to the pull request when the change does not affect what the page says.',
		);
	}
	return lines.join('\n');
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
	const rootDir = path.resolve(import.meta.dirname, '..');
	const base = process.argv[2] ?? 'origin/next';
	if (isReleaseBase(base)) {
		console.log(`Skipped: ${base} is the release branch.`);
		process.exit(0);
	}
	const changedFiles = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
		cwd: rootDir,
		encoding: 'utf8',
	})
		.split('\n')
		.filter(Boolean);
	const pages = readDevPages(rootDir);
	const report = formatReport(checkDevPages(rootDir, pages, changedFiles));

	if (report) {
		console.error(report);
		process.exitCode = 1;
	} else {
		console.log(`${pages.length} developer page(s) match the ${changedFiles.length} changed file(s).`);
	}
}
