import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/** Hidden marker that identifies the sticky pull request comment. */
export const COMMENT_MARKER = '<!-- ecopages-pr-stats -->';

/** Relative growth of a size total that is flagged in the report. */
export const GROWTH_THRESHOLD = 0.05;

/** Gzip size above which a JavaScript file that is new in the head is flagged. */
export const NEW_FILE_GZIP_LIMIT = 50 * 1024;

export type FileStat = { file: string; bytes: number; gzip: number };

export type Stats = {
	buildMs: number;
	total: { bytes: number; gzip: number };
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
export function measureDir(dir: string, buildMs = 0): Stats {
	const stats: Stats = {
		buildMs,
		total: { bytes: 0, gzip: 0 },
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
		stats.total.gzip += gzip;
		const ext = path.extname(full).slice(1);
		const type = ext === 'mjs' ? 'js' : ext;
		if (!TYPES.includes(type as (typeof TYPES)[number])) continue;
		const bucket = stats.types[type as (typeof TYPES)[number]];
		bucket.bytes += bytes;
		bucket.gzip += gzip;
		bucket.files += 1;
		if (type === 'js')
			stats.jsFiles.push({ file: path.relative(dir, full).split(path.sep).join('/'), bytes, gzip });
	}
	stats.jsFiles.sort((a, b) => b.bytes - a.bytes);
	return stats;
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
		base: measureDir(path.join(targets.base.appDir, 'dist', 'client'), Math.round(median(times.base))),
		head: measureDir(path.join(targets.head.appDir, 'dist', 'client'), Math.round(median(times.head))),
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

/** Renders the sticky comment body comparing `head` against `base`. */
export function renderComparison(base: Stats, head: Stats): string {
	const rows: Array<[string, number, number]> = [
		['Client total', base.total.bytes, head.total.bytes],
		['Client total (gzip)', base.total.gzip, head.total.gzip],
		...TYPES.map((type): [string, number, number] => [
			`${type.toUpperCase()}`,
			base.types[type].bytes,
			head.types[type].bytes,
		]),
		...TYPES.map((type): [string, number, number] => [
			`${type.toUpperCase()} (gzip)`,
			base.types[type].gzip,
			head.types[type].gzip,
		]),
	];
	const lines = [
		COMMENT_MARKER,
		'## Client output and build time',
		'',
		'| Metric | Base | Head | Change | |',
		'| --- | ---: | ---: | ---: | :-: |',
	];
	for (const [name, b, h] of rows) {
		lines.push(
			`| ${name} | ${formatBytes(b)} | ${formatBytes(h)} | ${delta(b, h, formatBytes)} | ${grew(b, h) ? 'warning' : ''} |`,
		);
	}
	lines.push(
		`| Cold build (median of 5, alternating, noisy) | ${base.buildMs} ms | ${head.buildMs} ms | ${delta(base.buildMs, head.buildMs, (n) => `${n} ms`)} | |`,
	);

	const flagged = findLargeNewFiles(base, head);
	if (flagged.length > 0) {
		lines.push('', `New JS files over ${NEW_FILE_GZIP_LIMIT / KB} kB gzip:`, '');
		for (const file of flagged)
			lines.push(`- \`${file.file}\`: ${formatBytes(file.bytes)} (${formatBytes(file.gzip)} gzip)`);
	}
	lines.push(
		'',
		'<details><summary>Largest JS files in the head</summary>',
		'',
		'| File | Size | Gzip |',
		'| --- | ---: | ---: |',
	);
	for (const file of head.jsFiles.slice(0, 5))
		lines.push(`| \`${file.file}\` | ${formatBytes(file.bytes)} | ${formatBytes(file.gzip)} |`);
	lines.push(
		'',
		'</details>',
		'',
		`Warning marks a size that grew more than ${GROWTH_THRESHOLD * 100}%. Build time runs on a shared runner: informational only.`,
		'',
	);
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
