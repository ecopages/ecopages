import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { extractEcopagesVirtualImports, isBrowserEcopagesVirtualImport } from './ecopages-virtual-imports.ts';

describe('ecopages-virtual-imports', () => {
	it('isBrowserEcopagesVirtualImport excludes content server resolver modules', () => {
		expect(isBrowserEcopagesVirtualImport('ecopages:content/docs')).toBe(true);
		expect(isBrowserEcopagesVirtualImport('ecopages:content/docs/server')).toBe(false);
		expect(isBrowserEcopagesVirtualImport('ecopages:images')).toBe(true);
	});

	it('extractEcopagesVirtualImports skips content server modules', () => {
		const dir = mkdtempSync(join(tmpdir(), 'ecopages-virtual-imports-'));
		const file = join(dir, 'page.tsx');

		try {
			writeFileSync(
				file,
				`
import { entries } from 'ecopages:content/docs';
import { getComponent } from 'ecopages:content/docs/server';
import type { Entry } from 'ecopages:content/docs';
`,
			);

			expect(extractEcopagesVirtualImports(file)).toEqual([
				{
					from: 'ecopages:content/docs',
					imports: ['entries'],
				},
			]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('reads a component file once in production and on every call otherwise', () => {
		const dir = mkdtempSync(join(tmpdir(), 'ecopages-virtual-imports-memo-'));
		const file = join(dir, 'component.ts');
		const originalNodeEnv = process.env.NODE_ENV;
		try {
			writeFileSync(file, "import { a } from 'ecopages:content/first';\n");

			process.env.NODE_ENV = 'production';
			const before = extractEcopagesVirtualImports(file);
			writeFileSync(file, "import { b } from 'ecopages:content/second';\n");
			const afterEdit = extractEcopagesVirtualImports(file);

			process.env.NODE_ENV = 'development';
			const developmentAfterEdit = extractEcopagesVirtualImports(file);

			expect(before.map((entry) => entry.from)).toEqual(['ecopages:content/first']);
			expect(afterEdit).toEqual(before);
			expect(developmentAfterEdit.map((entry) => entry.from)).toEqual(['ecopages:content/second']);
		} finally {
			process.env.NODE_ENV = originalNodeEnv;
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
