import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

type ReferencePattern = {
	pattern: RegExp;
	/** Whether a URL without `./`, `../` or `/` names a file beside the referencing file, as in CSS. */
	bareIsRelative: boolean;
	/** Whether the match is a `srcset` value, a list of candidate URLs. */
	srcset?: boolean;
};

/** Patterns whose URL is absolute, `./`-relative or a package specifier, as in HTML and JavaScript. */
const MODULE_REFERENCE_PATTERNS: ReferencePattern[] = [
	{ pattern: /\b(?:src|href|poster)=["']([^"']+)["']/g, bareIsRelative: false },
	{ pattern: /\b(?:srcset|imagesrcset)=["']([^"']+)["']/g, bareIsRelative: false, srcset: true },
	{ pattern: /\bfrom\s*["'`]([^"'`]+)["'`]/g, bareIsRelative: false },
	{ pattern: /\bimport\s*["'`]([^"'`]+)["'`]/g, bareIsRelative: false },
	{ pattern: /\bimport\(\s*["'`]([^"'`]+)["'`]\s*\)/g, bareIsRelative: false },
	{ pattern: /["'`](\/assets\/[^"'`\s]+)["'`]/g, bareIsRelative: false },
	{ pattern: /\bnew\s+URL\(\s*["'`]([^"'`]+)["'`]\s*,\s*import\.meta\.url\s*\)/g, bareIsRelative: true },
];

/** CSS patterns, where a bare URL is relative to the stylesheet. */
const STYLESHEET_REFERENCE_PATTERNS: ReferencePattern[] = [
	{ pattern: /@import\s+["']([^"']+)["']/g, bareIsRelative: true },
	{ pattern: /url\(\s*["']?([^"')]+?)["']?\s*\)/g, bareIsRelative: true },
];

function listFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(entry.parentPath, entry.name));
}

/** The URLs of a `srcset` value: each comma-separated candidate without its width or density descriptor. */
function srcsetUrls(value: string): string[] {
	if (/^\s*data:/i.test(value)) return [];
	return value
		.split(',')
		.map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
		.filter(Boolean);
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

export type ClientAssetReachability = {
	/** Files under `<clientDir>/assets` that no Page reaches, relative to `clientDir`. */
	unreachable: string[];
	/** Files that a Page, or a file it reaches, references and `clientDir` lacks, relative to `clientDir`. */
	missing: string[];
};

/**
 * Walks every reference from the Pages of a build and reports the files under `<clientDir>/assets` that no Page
 * reaches and the referenced files that are missing.
 *
 * @remarks
 * Walks from every exported HTML Page, and from `servedHtml` (Pages only a server renders), through `src`, `href`,
 * `poster`, `srcset` and `imagesrcset` attributes, inline scripts and the asset URLs they name, static and dynamic
 * imports between chunks, `new URL('…', import.meta.url)` (workers, wasm), and `url()` and `@import` in CSS. A
 * missing reference counts only when it names a file with an extension, since a link to a route such as `/images`
 * is answered by the server. Gzip copies and dotfiles such as the hashed-asset index are never unreachable: the
 * server reads them, not the browser.
 */
export function checkClientAssetReachability(
	clientDir: string,
	servedHtml: readonly string[] = [],
): ClientAssetReachability {
	const files = listFiles(clientDir);
	const reached = new Set<string>();
	const missing = new Set<string>();
	const queue: Array<{ dir: string; source: string }> = [
		...files
			.filter((file) => file.endsWith('.html'))
			.map((file) => ({ dir: path.dirname(file), source: readFileSync(file, 'utf8') })),
		...servedHtml.map((source) => ({ dir: clientDir, source })),
	];
	const patterns = [...MODULE_REFERENCE_PATTERNS, ...STYLESHEET_REFERENCE_PATTERNS];
	while (queue.length > 0) {
		const { dir, source } = queue.shift() as { dir: string; source: string };
		for (const { pattern, bareIsRelative, srcset } of patterns) {
			for (const match of source.matchAll(pattern)) {
				for (const url of srcset ? srcsetUrls(match[1] ?? '') : [match[1] ?? '']) {
					const target = resolveBrowserReference(clientDir, dir, url, bareIsRelative);
					if (!target || reached.has(target)) continue;
					if (!existsSync(target)) {
						if (path.extname(target)) missing.add(path.relative(clientDir, target));
						continue;
					}
					if (!statSync(target).isFile()) continue;
					reached.add(target);
					if (/\.(?:js|mjs|css)$/.test(target))
						queue.push({ dir: path.dirname(target), source: readFileSync(target, 'utf8') });
				}
			}
		}
	}
	const assetsDir = path.join(clientDir, 'assets');
	const unreachable = files
		.filter((file) => file.startsWith(`${assetsDir}${path.sep}`))
		.filter((file) => !file.endsWith('.gz') && !path.basename(file).startsWith('.'))
		.filter((file) => !reached.has(file))
		.map((file) => path.relative(clientDir, file))
		.sort();
	return { unreachable, missing: [...missing].sort() };
}
