import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveClassicScriptOptions } from './html-page-classic-script.ts';

describe('resolveClassicScriptOptions', () => {
	let dir: string;
	const page = '/app/src/pages/index.html';
	const write = (name: string, source: string) => {
		const filepath = path.join(dir, name);
		writeFileSync(filepath, source);
		return filepath;
	};

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), 'eco-classic-script-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('copies a JavaScript file as written', () => {
		const filepath = write('legacy.js', 'var ready = true; function init() {}');

		expect(resolveClassicScriptOptions(page, './legacy.js', filepath)).toEqual({ bundle: false });
	});

	it('only strips the types of a TypeScript file, so its globals survive', () => {
		const filepath = write('greeting.ts', 'function greet(name: string): string { return name; }');

		expect(resolveClassicScriptOptions(page, './greeting.ts', filepath)).toEqual({
			bundleOptions: { format: 'esm', splitting: false, treeshaking: false, minify: false },
		});
	});

	it.each([
		['an import', 'helper.ts', "import { x } from './x.ts';\nconsole.log(x);"],
		['an export', 'shared.js', 'export const value = 1;'],
		['import.meta', 'meta.ts', 'console.log(import.meta.url);'],
	])('rejects a classic script with %s and asks for type="module"', (_label, name, source) => {
		const filepath = write(name, source);

		expect(() => resolveClassicScriptOptions(page, `./${name}`, filepath)).toThrow(
			`${page}: "./${name}" uses import, export, or import.meta, which a classic script cannot. Add type="module" to its <script> tag.`,
		);
	});

	it('allows a dynamic import, which classic scripts support', () => {
		const filepath = write('lazy.js', "document.addEventListener('click', () => import('./chunk.js'));");

		expect(resolveClassicScriptOptions(page, './lazy.js', filepath)).toEqual({ bundle: false });
	});
});
