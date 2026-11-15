import { describe, expect, it } from 'vitest';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import { collectStaticImports } from './component-import-discovery.ts';
import { collectEcopagesVirtualImports } from './ecopages-virtual-imports.ts';

function virtualImportsOf(source: string) {
	return collectEcopagesVirtualImports(collectStaticImports(parseModuleSource('/app/page.tsx', source).program));
}

describe('ecopages-virtual-imports', () => {
	it('lists value imports of ecopages modules and skips type-only imports', () => {
		expect(
			virtualImportsOf(`
import { entries } from 'ecopages:content/docs';
import { getComponent } from 'ecopages:content/docs/server';
import { loadComponent } from 'ecopages:content/docs/component';
import type { Entry } from 'ecopages:content/docs';
`),
		).toEqual([
			{ from: 'ecopages:content/docs', imports: ['entries'] },
			{ from: 'ecopages:content/docs/server', imports: ['getComponent'] },
			{ from: 'ecopages:content/docs/component', imports: ['loadComponent'] },
		]);
	});

	it('merges named imports of one module, and a namespace import takes the whole module', () => {
		expect(
			virtualImportsOf(`
import { hero } from 'ecopages:images';
import { logo } from 'ecopages:images';
import * as content from 'ecopages:content/docs';
import { entries } from 'ecopages:content/docs';
`),
		).toEqual([
			{ from: 'ecopages:images', imports: ['hero', 'logo'] },
			{ from: 'ecopages:content/docs', imports: undefined },
		]);
	});
});
