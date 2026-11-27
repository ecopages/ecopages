import { describe, expect, it } from 'vitest';
import { getPreservedModuleFileName } from './preserved-module-file-name.ts';

describe('getPreservedModuleFileName', () => {
	it('names a module after its path from the root, a folder at a time', () => {
		expect(getPreservedModuleFileName('/', '/app/node_modules/zod/index.js')).toBe('app+node_modules+zod+index.js');
		expect(getPreservedModuleFileName('/app', '/app/node_modules/zod/index.js')).toBe('node_modules+zod+index.js');
	});

	it('keeps paths that differ by a separator or an extension apart', () => {
		const names = ['/p/a-b.js', '/p/a/b.js', '/p/index.js', '/p/index.mjs', '/p/a+b.js', '/p/a~2b~b.js'].map(
			(file) => getPreservedModuleFileName('/', file),
		);

		expect(new Set(names).size).toBe(names.length);
	});

	it('writes a character a URL or an import specifier would need escaped as hex', () => {
		const name = getPreservedModuleFileName('/', "/Users/O'Neil/café #1/100%/index.js");

		expect(name).toBe('Users+O~27~Neil+caf~e9~~20~~23~1+100~25~+index.js');
		expect(name).toMatch(/^[A-Za-z0-9._@=,+~-]+$/u);
	});

	it('shortens a name over the limit to a digest and the end of the path, and the same path gets the same name', () => {
		const deep = `/${'folder/'.repeat(40)}node_modules/pkg/lib/index.js`;
		const other = `/${'folder/'.repeat(41)}node_modules/pkg/lib/index.js`;

		const name = getPreservedModuleFileName('/', deep);

		expect(Buffer.byteLength(name)).toBeLessThanOrEqual(120);
		expect(name.endsWith('node_modules+pkg+lib+index.js')).toBe(true);
		expect(getPreservedModuleFileName('/', deep)).toBe(name);
		expect(getPreservedModuleFileName('/', other)).not.toBe(name);
	});
});
