import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { extractEcopagesVirtualImports, isBrowserEcopagesVirtualImport } from './ecopages-virtual-imports.ts';

describe('ecopages-virtual-imports', () => {
	it('isBrowserEcopagesVirtualImport excludes content server resolver modules', () => {
		expect(isBrowserEcopagesVirtualImport('ecopages:content/docs')).toBe(true);
		expect(isBrowserEcopagesVirtualImport('ecopages:content/docs/server')).toBe(false);
		expect(isBrowserEcopagesVirtualImport('ecopages:content/docs/component')).toBe(true);
		expect(isBrowserEcopagesVirtualImport('ecopages:images')).toBe(true);
	});

	it('extractEcopagesVirtualImports skips content server modules', () => {
		const dir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'ecopages-virtual-imports-')));
		const file = path.join(dir, 'page.tsx');

		try {
			writeFileSync(
				file,
				`
import { entries } from 'ecopages:content/docs';
import { getComponent } from 'ecopages:content/docs/server';
import { loadComponent } from 'ecopages:content/docs/component';
import type { Entry } from 'ecopages:content/docs';
`,
			);

			expect(extractEcopagesVirtualImports(file)).toEqual([
				{
					from: 'ecopages:content/docs',
					imports: ['entries'],
				},
				{
					from: 'ecopages:content/docs/component',
					imports: ['loadComponent'],
				},
			]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
