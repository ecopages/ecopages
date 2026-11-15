import { spawnSync } from 'node:child_process';
import { type Dirent, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/** Hidden marker that identifies the sticky pull request comment. */
export const COMMENT_MARKER = '<!-- ecopages-pr-stats -->';

/** Relative growth of a size total that is flagged in the report. */
export const GROWTH_THRESHOLD = 0.05;

/** Gzip size above which a JavaScript file that is new in the head is flagged. */
export const NEW_FILE_GZIP_LIMIT = 50 * 1024;

export type FileStat = {
	file: string;
	bytes: number;
	gzip: number;
	/** Whether the file is a `vendor-<package>` chunk of an installed package. */
	vendor: boolean;
};

/** The JavaScript a browser loads for one page, gzip bytes, split between third-party chunks and the rest. */
export type PageJs = {
	/** Gzip bytes of `vendor-*` chunks: installed packages, shared across pages. */
	vendor: number;
	/** Gzip bytes of every other chunk: the Ecopages runtime and the page's own code. */
	app: number;
	/** Names of the vendor chunks, such as `react-dom`, largest first. */
	vendorChunks: string[];
};

export type Stats = {
	buildMs: number;
	/** Every file of `dist/client` that is counted, maps and precompressed copies aside. */
	total: { bytes: number; files: number };
	/** Per page route, such as `/` or `/react-lab`. */
	pages: Record<string, PageJs>;
	types: Record<'js' | 'css' | 'html', { bytes: number; gzip: number; files: number }>;
	/** Every JavaScript file, largest first, so a compare can spot new files. */
	jsFiles: FileStat[];
};

const TYPES = ['js', 'css', 'html'] as const;

/**
 * Files left out of every total.
 *
 * @remarks
 * Source maps are not served to users, and the build writes `.gz` and `.br` copies next to compressible files,
 * so counting them would count those files twice.
 */
const SKIPPED_EXTENSIONS = ['.map', '.gz', '.br'];

function listFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? listFiles(full) : [full];
	});
}

export function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Measures a built client directory.
 *
 * @remarks
 * Source maps are excluded. Files other than js, css and html (images, fonts) count only toward the total.
 */
export function measureDir(dir: string, buildMs = 0, installed: ReadonlySet<string> = new Set()): Stats {
	const stats: Stats = {
		buildMs,
		total: { bytes: 0, files: 0 },
		pages: {},
		types: {
			js: { bytes: 0, gzip: 0, files: 0 },
			css: { bytes: 0, gzip: 0, files: 0 },
			html: { bytes: 0, gzip: 0, files: 0 },
		},
		jsFiles: [],
	};
	for (const full of listFiles(dir)) {
		if (SKIPPED_EXTENSIONS.some((extension) => full.endsWith(extension))) continue;
		const content = readFileSync(full);
		const bytes = content.length;
		const gzip = gzipSync(content).length;
		stats.total.bytes += bytes;
		stats.total.files += 1;
		const ext = path.extname(full).slice(1);
		const type = ext === 'mjs' ? 'js' : ext;
		if (!TYPES.includes(type as (typeof TYPES)[number])) continue;
		const bucket = stats.types[type as (typeof TYPES)[number]];
		bucket.bytes += bytes;
		bucket.gzip += gzip;
		bucket.files += 1;
		if (type === 'js')
			stats.jsFiles.push({
				file: path.relative(dir, full).split(path.sep).join('/'),
				bytes,
				gzip,
				vendor: vendorChunkPackage(path.basename(full), installed) !== undefined,
			});
	}
	stats.jsFiles.sort((a, b) => b.bytes - a.bytes);
	stats.pages = measurePages(dir, installed);
	return stats;
}

/**
 * Names of the packages installed for the app, spelled the way the build names their chunks.
 *
 * @remarks
 * Mirrors `getInstalledPackageChunkName` in `@ecopages/core`: `@scope/name` becomes `scope-name`. The names come from
 * the directories of `node_modules` and of the pnpm store (`node_modules/.pnpm/<id>/node_modules`) under each root,
 * which covers transitive dependencies. A chunk only counts as vendor when its name is in this set, so an app page that
 * happens to be called `vendor-share` stays app code.
 */
export function listInstalledPackages(...roots: string[]): Set<string> {
	const names = new Set<string>();
	const addFrom = (modulesDir: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(modulesDir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith('.')) continue;
			if (!entry.name.startsWith('@')) {
				names.add(entry.name);
				continue;
			}
			for (const inner of readdirSync(path.join(modulesDir, entry.name))) {
				names.add(`${entry.name.slice(1)}-${inner}`);
			}
		}
	};
	for (const root of roots) {
		const modulesDir = path.join(root, 'node_modules');
		addFrom(modulesDir);
		const store = path.join(modulesDir, '.pnpm');
		let ids: string[] = [];
		try {
			ids = readdirSync(store);
		} catch {
			continue;
		}
		for (const id of ids) addFrom(path.join(store, id, 'node_modules'));
	}
	return names;
}

/** The package a `vendor-<package>-<hash>.js` chunk holds, or `undefined` for any other file. */
function vendorChunkPackage(fileName: string, installed: ReadonlySet<string>): string | undefined {
	const name = /^vendor-(.+)-[A-Za-z0-9_-]{8}\.m?js$/.exec(fileName)?.[1];
	return name !== undefined && installed.has(name) ? name : undefined;
}

const MODULE_SCRIPT = /<script\b[^>]*\btype=["']module["'][^>]*>/gi;
const MODULE_PRELOAD = /<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi;
const SRC_OR_HREF = /\b(?:src|href)=["']([^"']+)["']/i;
const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*["']([^"']+)["']/g;

/** Route of a built HTML file: `index.html` is `/`, `a/index.html` is `/a`, `a.html` is `/a`. */
function routeOf(htmlFile: string): string {
	const route = htmlFile.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
	return `/${route}`;
}

/** Resolves a specifier found in `from` to a path under `dir`, or `undefined` for bare or external ones. */
function resolveSpecifier(dir: string, from: string, specifier: string): string | undefined {
	const clean = specifier.split(/[?#]/)[0];
	if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(clean)) return undefined;
	if (!clean.startsWith('/') && !clean.startsWith('.')) return undefined;
	const resolved = clean.startsWith('/')
		? path.join(dir, clean)
		: path.resolve(path.dirname(path.join(dir, from)), clean);
	const relative = path.relative(dir, resolved).split(path.sep).join('/');
	return relative.startsWith('..') ? undefined : relative;
}

/**
 * Measures the JavaScript each built page loads.
 *
 * @remarks
 * A page loads its module scripts and modulepreloads plus everything they statically import, so that closure is
 * followed from every HTML file and each file is counted once. Dynamic `import()` is not followed: those chunks
 * load on demand, not with the page. Chunks named `vendor-<package>-<hash>` of an installed package count as vendor, everything else as app.
 */
export function measurePages(dir: string, installed: ReadonlySet<string> = new Set()): Record<string, PageJs> {
	const sizes = new Map<string, number>();
	const imports = new Map<string, string[]>();
	const load = (file: string): string[] | undefined => {
		if (imports.has(file)) return imports.get(file);
		let content: Buffer;
		try {
			content = readFileSync(path.join(dir, file));
		} catch {
			return undefined;
		}
		sizes.set(file, gzipSync(content).length);
		const found: string[] = [];
		for (const match of content.toString('utf8').matchAll(STATIC_IMPORT)) {
			const resolved = resolveSpecifier(dir, file, match[1]);
			if (resolved) found.push(resolved);
		}
		imports.set(file, found);
		return found;
	};

	const pages: Record<string, PageJs> = {};
	for (const full of listFiles(dir)) {
		if (!full.endsWith('.html')) continue;
		const htmlFile = path.relative(dir, full).split(path.sep).join('/');
		const html = readFileSync(full, 'utf8');
		const queue: string[] = [];
		for (const tag of [...(html.match(MODULE_SCRIPT) ?? []), ...(html.match(MODULE_PRELOAD) ?? [])]) {
			const reference = SRC_OR_HREF.exec(tag)?.[1];
			const resolved = reference ? resolveSpecifier(dir, htmlFile, reference) : undefined;
			if (resolved) queue.push(resolved);
		}
		const seen = new Set<string>();
		while (queue.length > 0) {
			const file = queue.pop() as string;
			if (seen.has(file)) continue;
			const children = load(file);
			if (!children) continue;
			seen.add(file);
			queue.push(...children);
		}
		const page: PageJs = { vendor: 0, app: 0, vendorChunks: [] };
		const vendorFiles: Array<{ name: string; gzip: number }> = [];
		for (const file of seen) {
			const gzip = sizes.get(file) as number;
			const name = vendorChunkPackage(path.posix.basename(file), installed);
			if (name !== undefined) {
				page.vendor += gzip;
				vendorFiles.push({ name, gzip });
			} else page.app += gzip;
		}
		page.vendorChunks = vendorFiles.sort((a, b) => b.gzip - a.gzip).map((entry) => entry.name);
		pages[routeOf(htmlFile)] = page;
	}
	return pages;
}

/** A checkout to build: its kitchen-sink app and its CLI. */
type BuildTarget = { appDir: string; cliPath: string };

function targetOf(root: string): BuildTarget {
	const resolved = path.resolve(root);
	return {
		appDir: path.join(resolved, 'playground', 'kitchen-sink'),
		cliPath: path.join(resolved, 'packages', 'ecopages', 'bin', 'cli.js'),
	};
}

function installedOf(root: string, target: BuildTarget): Set<string> {
	return listInstalledPackages(path.resolve(root), target.appDir);
}

function buildCold(target: BuildTarget): number {
	rmSync(path.join(target.appDir, 'dist'), { recursive: true, force: true });
	rmSync(path.join(target.appDir, '.eco'), { recursive: true, force: true });
	const start = performance.now();
	const result = spawnSync(process.execPath, [target.cliPath, 'build', '--runtime', 'node'], {
		cwd: target.appDir,
		stdio: 'inherit',
	});
	if (result.status !== 0) throw new Error(`Build failed in ${target.appDir} with exit code ${result.status}`);
	return performance.now() - start;
}

/**
 * Builds the base and the head cold `runs` times each and measures each one's last `dist/client`.
 *
 * @remarks
 * The builds alternate, and each round swaps which side goes first, so a runner that slows down or warms up
 * during the job moves both medians alike instead of skewing the comparison.
 */
export function measurePair(baseRoot: string, headRoot: string, runs = 5): { base: Stats; head: Stats } {
	const targets = { base: targetOf(baseRoot), head: targetOf(headRoot) };
	const times: { base: number[]; head: number[] } = { base: [], head: [] };
	for (let index = 0; index < runs; index++) {
		const order: Array<'base' | 'head'> = index % 2 === 0 ? ['base', 'head'] : ['head', 'base'];
		for (const side of order) times[side].push(buildCold(targets[side]));
	}
	return {
		base: measureDir(
			path.join(targets.base.appDir, 'dist', 'client'),
			Math.round(median(times.base)),
			installedOf(baseRoot, targets.base),
		),
		head: measureDir(
			path.join(targets.head.appDir, 'dist', 'client'),
			Math.round(median(times.head)),
			installedOf(headRoot, targets.head),
		),
	};
}

const KB = 1024;

export function formatBytes(bytes: number): string {
	const abs = Math.abs(bytes);
	if (abs < KB) return `${bytes} B`;
	return `${(bytes / KB).toFixed(abs < 10 * KB ? 2 : 1)} kB`;
}

function delta(base: number, head: number, format: (n: number) => string): string {
	const diff = head - base;
	if (diff === 0) return '0';
	const pct = base === 0 ? 'new' : `${diff > 0 ? '+' : ''}${((diff / base) * 100).toFixed(1)}%`;
	return `${diff > 0 ? '+' : '-'}${format(Math.abs(diff))} (${pct})`;
}

function grew(base: number, head: number): boolean {
	return base === 0 ? head > 0 : (head - base) / base > GROWTH_THRESHOLD;
}

/**
 * New JavaScript files in the head whose gzip size passes {@link NEW_FILE_GZIP_LIMIT}.
 *
 * @remarks
 * Bundles carry a content hash (`client-Bn3vGHPx.js`), so files are matched by name with the hash removed.
 */
export function findLargeNewFiles(base: Stats, head: Stats): FileStat[] {
	const unhashed = (file: string): string => file.replace(/-[A-Za-z0-9_-]{8}(?=\.js$)/, '');
	const known = new Set(base.jsFiles.map((file) => unhashed(file.file)));
	return head.jsFiles.filter((file) => !known.has(unhashed(file.file)) && file.gzip > NEW_FILE_GZIP_LIMIT);
}

/** Pages always shown in the per-page table, when the head has them. */
const NAMED_PAGES: Array<[string, string]> = [
	['/', 'Kita'],
	['/react-lab', 'React'],
	['/variant-lit', 'Lit'],
	['/api-lab', 'Kita, no React'],
];

const DOCS_URL = 'https://ecopages.app/dev/benchmarks-and-ci';

/** Error pages such as `/404` ship no JavaScript, so they say nothing about a typical page. */
const ERROR_PAGE = /^\/[45]\d\d$/;

const pageTotal = (page: PageJs): number => page.vendor + page.app;

/**
 * Picks the rows of the per-page table from the head: the smallest, median and largest page by total JS (error pages aside), then the named pages.
 */
export function selectPages(head: Stats): Array<{ label: string; route: string }> {
	const ranked = Object.entries(head.pages)
		.filter(([route]) => !ERROR_PAGE.test(route))
		.sort((a, b) => pageTotal(a[1]) - pageTotal(b[1]));
	const rows: Array<{ label: string; route: string }> = [];
	if (ranked.length > 0) {
		rows.push({ label: 'Smallest page', route: ranked[0][0] });
		rows.push({ label: 'Median page', route: ranked[Math.floor((ranked.length - 1) / 2)][0] });
		rows.push({ label: 'Largest page', route: ranked[ranked.length - 1][0] });
	}
	for (const [route, label] of NAMED_PAGES) if (head.pages[route]) rows.push({ label: `${label}`, route });
	return rows;
}

function cell(base: number | undefined, head: number): string {
	if (base === undefined) return `new: ${formatBytes(head)}`;
	if (head === base) return formatBytes(head);
	return `${formatBytes(base)} to ${formatBytes(head)} (${delta(base, head, formatBytes)})${grew(base, head) ? ' warning' : ''}`;
}

function percent(part: number, whole: number): string {
	return whole === 0 ? '0%' : `${((part / whole) * 100).toFixed(1)}%`;
}

/** Renders the sticky comment body comparing `head` against `base`. */
export function renderComparison(base: Stats, head: Stats): string {
	const lines = [
		COMMENT_MARKER,
		'## Kitchen-sink build stats',
		'',
		`The [kitchen-sink](${DOCS_URL}) demo app: ${Object.keys(head.pages).length} pages across every Integration.`,
		'',
		'### JS per page (gzip)',
		'',
		'| Page | Route | Vendor | App | Total | Vendor chunks |',
		'| --- | --- | --- | --- | --- | --- |',
	];
	for (const { label, route } of selectPages(head)) {
		const h = head.pages[route];
		const b = base.pages[route];
		lines.push(
			`| ${label} | \`${route}\` | ${cell(b?.vendor, h.vendor)} | ${cell(b?.app, h.app)} | ${cell(b && pageTotal(b), pageTotal(h))} | ${h.vendorChunks.join(', ') || 'none'} |`,
		);
	}
	lines.push(
		'',
		`Vendor chunks stay cached across deploys. Warning: grew more than ${GROWTH_THRESHOLD * 100}%.`,
		'',
		`Cold build: ${base.buildMs} ms to ${head.buildMs} ms (${delta(base.buildMs, head.buildMs, (n) => `${n} ms`)}), noisy.`,
	);

	const flagged = findLargeNewFiles(base, head);
	if (flagged.length > 0) {
		lines.push('', `New JS files over ${NEW_FILE_GZIP_LIMIT / KB} kB gzip:`, '');
		for (const file of flagged)
			lines.push(`- \`${file.file}\`: ${formatBytes(file.bytes)} (${formatBytes(file.gzip)} gzip)`);
	}

	const staticAssets = (stats: Stats): number =>
		stats.total.bytes - TYPES.reduce((sum, type) => sum + stats.types[type].bytes, 0);
	const vendorGzip = (stats: Stats): number =>
		stats.jsFiles
			.filter((file) => path.posix.basename(file.file).startsWith('vendor-'))
			.reduce((sum, file) => sum + file.gzip, 0);
	lines.push(
		'',
		'<details><summary>Totals</summary>',
		'',
		'Code:',
		'',
		'| Type | Base | Head | Change | Base gzip | Head gzip | Change |',
		'| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
	);
	for (const type of TYPES) {
		const b = base.types[type];
		const h = head.types[type];
		lines.push(
			`| ${type.toUpperCase()} | ${formatBytes(b.bytes)} | ${formatBytes(h.bytes)} | ${delta(b.bytes, h.bytes, formatBytes)}${grew(b.bytes, h.bytes) ? ' warning' : ''} | ${formatBytes(b.gzip)} | ${formatBytes(h.gzip)} | ${delta(b.gzip, h.gzip, formatBytes)}${grew(b.gzip, h.gzip) ? ' warning' : ''} |`,
		);
	}
	lines.push(
		'',
		'Images, fonts and other files:',
		'',
		'| | Base | Head | Change |',
		'| --- | ---: | ---: | ---: |',
		`| Static assets | ${formatBytes(staticAssets(base))} | ${formatBytes(staticAssets(head))} | ${delta(staticAssets(base), staticAssets(head), formatBytes)} |`,
		`| All files in dist/client | ${formatBytes(base.total.bytes)} | ${formatBytes(head.total.bytes)} | ${delta(base.total.bytes, head.total.bytes, formatBytes)} |`,
		'',
		`Vendor share of JS (gzip): ${percent(vendorGzip(base), base.types.js.gzip)} to ${percent(vendorGzip(head), head.types.js.gzip)}.`,
		'',
		'</details>',
		'',
		'<details><summary>Largest JS files</summary>',
		'',
		'| File | Size | Gzip |',
		'| --- | ---: | ---: |',
	);
	for (const file of head.jsFiles.slice(0, 5))
		lines.push(`| \`${file.file}\` | ${formatBytes(file.bytes)} | ${formatBytes(file.gzip)} |`);
	lines.push('', '</details>', '');
	return lines.join('\n');
}

function main(argv: string[]): void {
	const [command, ...args] = argv;
	if (command === 'measure') {
		const [baseRoot, headRoot, baseOut, headOut, runs] = args;
		const { base, head } = measurePair(baseRoot, headRoot, runs ? Number(runs) : 5);
		writeFileSync(baseOut, `${JSON.stringify(base, null, '\t')}\n`);
		writeFileSync(headOut, `${JSON.stringify(head, null, '\t')}\n`);
	} else if (command === 'compare') {
		const [baseFile, headFile] = args;
		const read = (file: string): Stats => JSON.parse(readFileSync(file, 'utf8')) as Stats;
		process.stdout.write(renderComparison(read(baseFile), read(headFile)));
	} else {
		console.error(
			'Usage: pr-stats.ts measure <base-root> <head-root> <base.json> <head.json> [runs] | compare <base.json> <head.json>',
		);
		process.exitCode = 1;
	}
}

if (import.meta.main) main(process.argv.slice(2));
