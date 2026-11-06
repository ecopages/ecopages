import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { findWorkerUrls } from './worker-urls.ts';

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
		"new Worker('./w.js', { type: 'module' })",
		"new Worker(new URL('./w.ts', location.href), { type: 'module' })",
		"new Worker(new URL('./w.ts'), { type: 'module' })",
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
