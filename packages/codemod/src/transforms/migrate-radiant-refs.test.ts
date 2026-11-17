import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jscodeshift from 'jscodeshift';
import prettier from 'prettier';
import { describe, expect, it, vi } from 'vitest';
import transform, { partNameOf } from './migrate-radiant-refs.ts';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'migrate-radiant-refs');

const j = jscodeshift.withParser('tsx');

function runRaw(source: string, report: (message: string) => void = () => {}): string | null {
	return transform({ path: 'fixture.tsx', source }, { j, jscodeshift: j, stats: () => {}, report }, {});
}

async function runTransform(source: string, report?: (message: string) => void): Promise<string | null> {
	const result = runRaw(source, report);
	if (!result) {
		return null;
	}
	const config = await prettier.resolveConfig('fixture.tsx');
	return prettier.format(result, { ...config, parser: 'typescript' });
}

function readFixture(name: string, extension: 'input' | 'output'): string {
	return readFileSync(path.join(fixturesDir, `${name}.${extension}.tsx`), 'utf-8');
}

const fixtures = ['decorators', 'subpath-refs', 'subpath-mixed', 'create-query', 'prototype-call'];

const header = "import { RadiantElement, controller, query, registerController } from '@ecopages/radiant';\n";

describe('migrate-radiant-refs', () => {
	it.each(fixtures)('migrates %s', async (name) => {
		const report = vi.fn();
		expect(await runTransform(readFixture(name, 'input'), report)).toBe(readFixture(name, 'output'));
		expect(report).not.toHaveBeenCalled();
	});

	it('leaves the new forms, getRef, @onEvent({ ref }), data-ref and ref callbacks unchanged', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('already-migrated', 'input'), report)).toBeNull();
		expect(report).not.toHaveBeenCalled();
	});

	it('is idempotent', async () => {
		for (const name of fixtures) {
			expect(await runTransform(readFixture(name, 'output'))).toBeNull();
		}
	});

	it.each([
		['menubarRoot', 'menubar-root'],
		['listboxID', 'listbox-id'],
		['max_width', 'max-width'],
		['rangeTrack', 'range-track'],
		['label', 'label'],
	])('derives the part name of %s as %s, as Radiant does', (field, part) => {
		expect(partNameOf(field)).toBe(part);
	});

	it('keeps the source formatting: a multi-line import, spaces, CRLF and JSX text', () => {
		const source = [
			'import {',
			'    RadiantElement,',
			'    query,',
			"} from '@ecopages/radiant';",
			'',
			'export class Menu extends RadiantElement {',
			"    @query({ ref: 'menu-root' }) menuRoot!: HTMLElement | null;",
			'    render() {',
			'        return <p>{this.menuRoot} / {this.menuRoot}</p>;',
			'    }',
			'}',
			'',
		].join('\r\n');
		expect(runRaw(source)).toBe(
			source.replace('    query,', '    ref,').replace("@query({ ref: 'menu-root' })", '@ref()'),
		);
	});

	it('reuses an existing import of the new name and removes an import left empty, line and all', () => {
		const source = [
			"import { RadiantElement, ref } from '@ecopages/radiant';",
			"import { query } from '@ecopages/radiant/decorators/query';",
			'',
			'export class A extends RadiantElement {',
			"\t@query({ ref: 'item' }) item!: HTMLElement | null;",
			'}',
			'',
		].join('\n');
		expect(runRaw(source)).toBe(
			source
				.replace("import { query } from '@ecopages/radiant/decorators/query';\n", '')
				.replace("@query({ ref: 'item' })", '@ref()'),
		);
	});

	it('drops cache: true and reports it, since the field no longer holds a stable node', () => {
		const report = vi.fn();
		const source = `${header}class A extends RadiantElement {\n\t@query({ selector: 'input', cache: true }) input!: HTMLInputElement | null;\n}\n`;
		expect(runRaw(source, report)).toBe(
			source.replace("@query({ selector: 'input', cache: true })", "@query('input')"),
		);
		expect(report).toHaveBeenCalledOnce();
		expect(report).toHaveBeenCalledWith(expect.stringContaining('fixture.tsx:3: drops cache'));
	});

	it('does not report string ref attributes in a file that uses neither Radiant nor @ecopages/jsx', () => {
		const report = vi.fn();
		expect(
			runRaw('import React from \'react\';\nexport const A = () => <div ref="legacy" />;\n', report),
		).toBeNull();
		expect(report).not.toHaveBeenCalled();
	});

	it('does not report hydration keys in a file that registers no controller, or a key that is already scoped', () => {
		const report = vi.fn();
		const source = `import { RadiantElement } from '@ecopages/radiant';\nexport const a = <script data-hydration-key="count" />;\nexport const b = '<script data-hydration-key="menu:count">';\n`;
		expect(runRaw(source, report)).toBeNull();
		expect(
			runRaw(source.replace('{ RadiantElement }', '{ controller }').replace('"count"', '"menu:count"'), report),
		).toBeNull();
		expect(report).not.toHaveBeenCalled();
	});

	describe('reports', () => {
		const cases: Array<[string, string, string, number]> = [
			[
				'a QueryConfig import',
				"import type { QueryConfig } from '@ecopages/radiant/decorators/query';\nexport const config: QueryConfig = { selector: 'a' };\n",
				'imports QueryConfig',
				1,
			],
			[
				'spread options',
				`${header}const base = { all: true };\nclass A extends RadiantElement {\n\t@query({ ...base, ref: 'item' }) items!: HTMLElement[];\n}\n`,
				'options this codemod cannot read',
				4,
			],
			[
				'an all that is not a literal',
				`${header}const many = true;\nclass A extends RadiantElement {\n\t@query({ selector: 'li', all: many }) items!: HTMLElement[];\n}\n`,
				'an `all` that is not true or false',
				4,
			],
			[
				'options held in a constant',
				`${header}const options = { ref: 'item' };\nclass A extends RadiantElement {\n\t@query(options) item!: HTMLElement | null;\n}\n`,
				'something other than an options literal',
				4,
			],
			[
				'both selector and ref',
				`${header}class A extends RadiantElement {\n\t@query({ selector: 'li', ref: 'item' }) item!: HTMLElement | null;\n}\n`,
				'neither or both',
				3,
			],
			[
				'a createQuery ref that is not a literal',
				"import { createQuery } from '@ecopages/radiant/helpers/create-query';\nexport const read = (host: Element, name: string) => createQuery(host, { ref: name });\n",
				'getRef(name) on the host (only the parts it owns) or createQuery(host, \'[data-ref="name"]\')',
				2,
			],
			[
				'a createQuery ref that needs escaping',
				"import { createQuery } from '@ecopages/radiant/helpers/create-query';\nexport const read = (host: Element) => createQuery(host, { ref: 'say \"hi\"' });\n",
				'a `ref` that is not a plain string',
				2,
			],
			[
				'a write through getReactiveMember',
				`${header}class A extends RadiantElement {\n\treset() {\n\t\tthis.getReactiveMember('count').set(0);\n\t}\n}\n`,
				'getReactiveMember(...).set',
				4,
			],
			[
				'a @controller identifier with a colon',
				`${header}@controller('ui:menu')\nexport class Menu {}\n`,
				"controller identifier 'ui:menu'",
				2,
			],
			[
				'a registerController identifier with a colon',
				`${header}class Menu {}\nregisterController('ui:menu', Menu as never);\n`,
				"controller identifier 'ui:menu'",
				3,
			],
			[
				'a string ref attribute',
				`${header}export const view = <div ref="toast" />;\n`,
				'string ref attribute',
				2,
			],
			[
				'a hydration key in JSX in a controller file',
				`${header}export const view = <script data-hydration-key="theme" />;\n`,
				'data-hydration-key="theme"',
				2,
			],
			[
				'a hydration key in a string in a controller file',
				`${header}export const html = '<script data-hydration-key="theme"></script>';\n`,
				'is now keyed "id:theme"',
				2,
			],
			[
				'a new name the file already declares',
				`${header}const ref = 1;\nclass A extends RadiantElement {\n\t@query({ ref: 'item' }) item!: HTMLElement | null;\n}\n`,
				'needs ref, but the file already declares that name',
				4,
			],
			[
				'query imported from a module that does not export the new names',
				"import { RadiantElement } from '@ecopages/radiant';\nimport { query } from '@ecopages/radiant/decorators/legacy/query';\nclass A extends RadiantElement {\n\t@query({ ref: 'item' }) item!: HTMLElement | null;\n}\n",
				'does not export it',
				4,
			],
		];

		it.each(cases)('leaves %s unchanged and reports its line', (_name, source, reason, line) => {
			const report = vi.fn();
			expect(runRaw(source, report)).toBeNull();
			expect(report).toHaveBeenCalledWith(expect.stringContaining(`fixture.tsx:${line}: `));
			expect(report).toHaveBeenCalledWith(expect.stringContaining(reason));
		});
	});
});
