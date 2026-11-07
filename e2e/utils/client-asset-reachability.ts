import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Patterns whose URL is absolute, `./`-relative or a package specifier, as in HTML and JavaScript. */
const MODULE_REFERENCE_PATTERNS = [
	/\b(?:src|href)=["']([^"']+)["']/g,
	/\bfrom\s*["'`]([^"'`]+)["'`]/g,
	/\bimport\s*["'`]([^"'`]+)["'`]/g,
	/\bimport\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
	/["'`](\/assets\/[^"'`\s]+)["'`]/g,
];

/** CSS patterns, where a bare URL is relative to the stylesheet. */
const STYLESHEET_REFERENCE_PATTERNS = [/@import\s+["']([^"']+)["']/g, /url\(\s*["']?([^"')]+?)["']?\s*\)/g];

function listFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * Resolves a URL a Page or browser file names to a path under `clientDir`, or `undefined` for a package specifier,
 * another origin or a data URL.
 */
function resolveBrowserReference(
	clientDir: string,
	fromDir: string,
	url: string,
	bareIsRelative: boolean,
): string | undefined {
	const pathname = decodeURIComponent(url.split(/[?#]/)[0] ?? '');
	if (!pathname || pathname.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(pathname)) return undefined;
	if (pathname.startsWith('/')) return path.join(clientDir, ...pathname.split('/'));
	if (pathname.startsWith('./') || pathname.startsWith('../') || bareIsRelative) {
		return path.resolve(fromDir, ...pathname.split('/'));
	}
	return undefined;
}

/**
 * Lists the files under `<clientDir>/assets` that no Page reaches, relative to `clientDir`.
 *
 * @remarks
 * Walks from every exported HTML Page, and from `servedHtml` (Pages only a server renders), through `src` and
 * `href` attributes, inline scripts and the asset URLs they name, static and dynamic imports between chunks, and
 * `url()` and `@import` in CSS. Gzip copies and dotfiles such as the hashed-asset index are skipped: the server
 * reads them, not the browser.
 */
export function listUnreachableClientAssets(clientDir: string, servedHtml: readonly string[] = []): string[] {
	const files = listFiles(clientDir);
	const reached = new Set<string>();
	const queue: Array<{ dir: string; source: string }> = [
		...files
			.filter((file) => file.endsWith('.html'))
			.map((file) => ({ dir: path.dirname(file), source: readFileSync(file, 'utf8') })),
		...servedHtml.map((source) => ({ dir: clientDir, source })),
	];
	while (queue.length > 0) {
		const { dir, source } = queue.shift() as { dir: string; source: string };
		const patterns = [
			...MODULE_REFERENCE_PATTERNS.map((pattern) => ({ pattern, bareIsRelative: false })),
			...STYLESHEET_REFERENCE_PATTERNS.map((pattern) => ({ pattern, bareIsRelative: true })),
		];
		for (const { pattern, bareIsRelative } of patterns) {
			for (const match of source.matchAll(pattern)) {
				const target = resolveBrowserReference(clientDir, dir, match[1] ?? '', bareIsRelative);
				if (!target || reached.has(target) || !existsSync(target)) continue;
				reached.add(target);
				if (/\.(?:js|mjs|css)$/.test(target))
					queue.push({ dir: path.dirname(target), source: readFileSync(target, 'utf8') });
			}
		}
	}
	const assetsDir = path.join(clientDir, 'assets');
	return files
		.filter((file) => file.startsWith(`${assetsDir}${path.sep}`))
		.filter((file) => !file.endsWith('.gz') && !path.basename(file).startsWith('.'))
		.filter((file) => !reached.has(file))
		.map((file) => path.relative(clientDir, file))
		.sort();
}
