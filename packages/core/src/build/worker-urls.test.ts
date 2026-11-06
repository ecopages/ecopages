import { parseSync } from 'oxc-parser';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findWorkerEntrySource, findWorkerUrls } from './worker-urls.ts';

function find(code: string) {
	return findWorkerUrls(parseSync('module.ts', code, { sourceType: 'module', lang: 'ts' }).program, code).map(
		({ kind, constructorName, specifier }) => ({ kind, constructorName, specifier }),
	);
}

describe('findWorkerUrls', () => {
	it.each([
		["new Worker(new URL('./w.ts', import.meta.url), { type: 'module' })", 'Worker', './w.ts'],
		[
			"new SharedWorker(new URL('./w.ts', import.meta.url), { type: 'module', name: 'shared' })",
			'SharedWorker',
			'./w.ts',
		],
		['new Worker(new URL(`./w.ts`, import.meta.url), { "type": "module" })', 'Worker', './w.ts'],
		["new Worker(new URL('../w.ts', import.meta.url), options)", 'Worker', '../w.ts'],
		["new Worker(new URL('./w.ts', import.meta.url), { ...options })", 'Worker', './w.ts'],
		["new Worker(new URL('./w.ts', import.meta.url), { type: workerType })", 'Worker', './w.ts'],
	])('reads %s as a worker entry', (code, constructorName, specifier) => {
		expect(find(code)).toEqual([{ kind: 'entry', constructorName, specifier }]);
	});

	it.each([
		"new Worker(new URL('./w.ts', import.meta.url))",
		"new Worker(new URL('./w.ts', import.meta.url), { name: 'w' })",
		"new SharedWorker(new URL('./w.ts', import.meta.url), { type: 'classic' })",
	])('reads %s as a classic worker', (code) => {
		expect(find(code)).toMatchObject([{ kind: 'classic', specifier: './w.ts' }]);
	});

	it('reads a URL that is not a literal as dynamic, with its source text', () => {
		expect(find("new Worker(new URL(`./${name}.ts`, import.meta.url), { type: 'module' })")).toEqual([
			{ kind: 'dynamic', constructorName: 'Worker', specifier: '`./${name}.ts`' },
		]);
	});

	it.each(["'/workers/w.js'", "'https://example.com/w.js'", "'w.js'"])('reads %s as not relative', (url) => {
		expect(find(`new Worker(new URL(${url}, import.meta.url), { type: 'module' })`)).toMatchObject([
			{ kind: 'non-relative' },
		]);
	});

	it.each([
		"new Worker(new URL('./w.ts', import.meta.url) as URL, { type: 'module' })",
		"new Worker(new URL('./w.ts', import.meta.url) satisfies URL, { type: 'module' })",
		"new Worker(new URL('./w.ts', import.meta.url)!, { type: 'module' })",
		"new Worker((new URL('./w.ts', import.meta.url)), { type: 'module' })",
		"new Worker(<URL>new URL('./w.ts' as string, (import.meta.url)), { type: 'module' })",
	])('reads %s as a worker entry through type assertions and parentheses', (code) => {
		expect(find(code)).toEqual([{ kind: 'entry', constructorName: 'Worker', specifier: './w.ts' }]);
	});

	it.each([
		["new Worker(workerUrl, { type: 'module' })", 'Worker', 'workerUrl'],
		[
			"new Worker(new URL('./w.ts', location.href), { type: 'module' })",
			'Worker',
			"new URL('./w.ts', location.href)",
		],
		["new Worker(new URL('./w.ts'), { type: 'module' })", 'Worker', "new URL('./w.ts')"],
		['new SharedWorker(getUrl() as URL)', 'SharedWorker', 'getUrl() as URL'],
	])('reads %s as indirect, with the source text of its first argument', (code, constructorName, specifier) => {
		expect(find(code)).toEqual([{ kind: 'indirect', constructorName, specifier }]);
	});

	it.each(["'./w.ts?worker'", "'./w.ts#main'"])('reads %s as a URL with a query', (url) => {
		expect(find(`new Worker(new URL(${url}, import.meta.url), { type: 'module' })`)).toMatchObject([
			{ kind: 'query' },
		]);
	});

	it.each([
		"new Worker('./w.js', { type: 'module' })",
		'new Worker(`/w.js`)',
		"new MyWorker(new URL('./w.ts', import.meta.url))",
		"new window.Worker(new URL('./w.ts', import.meta.url))",
	])('ignores %s', (code) => {
		expect(find(code)).toEqual([]);
	});

	it('returns the span of the URL literal, quotes included', () => {
		const code = "const w = new Worker(new URL('./w.ts', import.meta.url), { type: 'module' });";
		const [url] = findWorkerUrls(parseSync('m.ts', code, { sourceType: 'module', lang: 'ts' }).program, code);

		expect(code.slice(url!.start, url!.end)).toBe("'./w.ts'");
	});

	it('finds nested workers in source order', () => {
		const code = [
			"function start() { return new Worker(new URL('./a.ts', import.meta.url), { type: 'module' }); }",
			"const b = () => new SharedWorker(new URL('./b.ts', import.meta.url), { type: 'module' });",
		].join('\n');

		expect(find(code).map((url) => url.specifier)).toEqual(['./a.ts', './b.ts']);
	});
});

describe('findWorkerEntrySource', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), 'worker-entry-source-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	function write(name: string, code: string): string {
		const filePath = path.join(dir, name);
		writeFileSync(filePath, code);
		return filePath;
	}

	it('names the source that starts a worker entry', () => {
		const plain = write('plain.ts', 'export const value = 1;\n');
		const starter = write('starter.ts', "new Worker(new URL('./w.ts', import.meta.url), { type: 'module' });\n");

		expect(findWorkerEntrySource([plain, starter])).toMatchObject({
			sourcePath: starter,
			url: { kind: 'entry', specifier: './w.ts' },
		});
	});

	it('finds nothing when no source starts a worker the build emits', () => {
		const publicWorker = write('public.ts', "new Worker(new URL('/w.js', import.meta.url), { type: 'module' });\n");

		expect(findWorkerEntrySource([publicWorker, path.join(dir, 'missing.ts')])).toBeUndefined();
	});
});
