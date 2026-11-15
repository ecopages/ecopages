import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	createForeignModuleReader,
	createForeignStubSource,
	fromForeignStubSpecifier,
	toForeignStubSpecifier,
} from './foreign-module.ts';

const roots: string[] = [];

function setup(source: string) {
	const root = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-foreign-module-'))));
	roots.push(root);
	const file = path.join(root, 'card.tsx');
	writeFileSync(file, source);
	const read = createForeignModuleReader({ rootDir: root, integrationOf: () => 'ecopages-jsx' });
	return { root, file, read };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('createForeignModuleReader', () => {
	it('splits static Components from the other value exports and leaves types out', () => {
		const { file, read } = setup(
			[
				"import { eco } from '@ecopages/core';",
				"export const Card = eco.component({ render: () => '' });",
				"export default eco.component({ render: () => '' });",
				'export const make = () => eco.component({ render: () => "" });',
				'export enum Size { Small }',
				'export interface Props { a: number }',
				'export type Alias = string;',
				"export * as icons from './icons';",
				"export { type Theme } from './theme';",
			].join('\n'),
		);
		const module = read(file)!;
		expect([...module.identities.keys()].sort()).toEqual(['Card', 'default']);
		expect([...module.values].sort()).toEqual(['Size', 'icons', 'make']);
		expect(module.star).toBe(false);
	});

	it('counts an export * or a destructured export as names it cannot know', () => {
		expect(setup("export * from './icons';").read(path.join(roots.at(-1)!, 'card.tsx'))!.star).toBe(true);
		expect(setup('export const { a, b } = { a: 1, b: 2 };').read(path.join(roots.at(-1)!, 'card.tsx'))!.star).toBe(
			true,
		);
	});

	it('reads the file again when its source changes', () => {
		const { file, read } = setup("import { eco } from '@ecopages/core';\nexport const Card = eco.component({});");
		expect(read(file)!.identities.has('Card')).toBe(true);
		writeFileSync(file, "import { eco } from '@ecopages/core';\nexport const Badge = eco.component({});");
		expect([...read(file)!.identities.keys()]).toEqual(['Badge']);
	});

	it('has no entry for a file no Integration owns', () => {
		const { root, file } = setup('export const a = 1;');
		expect(createForeignModuleReader({ rootDir: root, integrationOf: () => undefined })(file)).toBeUndefined();
	});
});

describe('stub specifiers and source', () => {
	it('round-trips a file inside and outside the app root', () => {
		const root = path.resolve('/app');
		for (const file of [path.resolve('/app/src/card.tsx'), path.resolve('/shared/ui/card.tsx')]) {
			const specifier = toForeignStubSpecifier(root, file);
			expect(fromForeignStubSpecifier(root, specifier)).toBe(file);
		}
		expect(toForeignStubSpecifier(root, path.resolve('/shared/ui/card.tsx'))).toBe(
			'ecopages-react-foreign-stub:../shared/ui/card.tsx',
		);
	});

	it('exports one boundary per static Component and imports nothing else', () => {
		const identity = { id: 'x', file: 'card.tsx', integration: 'ecopages-jsx' };
		const source = createForeignStubSource(
			{
				identities: new Map([
					['default', identity],
					['data-card', identity],
				]),
				values: new Set(['make']),
				star: false,
			},
			'@ecopages/react/foreign-boundary',
		);
		expect(source).toContain('export { __eco_stub_0 as default, __eco_stub_1 as "data-card" };');
		expect(source.match(/\bimport\b/g)).toHaveLength(1);
		expect(source).not.toContain('make');
	});
});
