import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jscodeshift from 'jscodeshift';
import prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import transform, { parser } from './migrate-to-eco-page.ts';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'migrate-to-eco-page');

const j = jscodeshift.withParser('tsx');

async function runTransform(source: string, fixturePath = 'fixture.tsx'): Promise<string | null> {
	const result = transform({ path: fixturePath, source }, { jscodeshift: j }, {});
	if (!result) {
		return null;
	}
	const config = await prettier.resolveConfig(fixturePath);
	return prettier.format(result, { ...config, parser: 'typescript' });
}

function readFixture(name: string, extension: 'input' | 'output'): string {
	return readFileSync(path.join(fixturesDir, `${name}.${extension}.tsx`), 'utf-8');
}

describe('migrate-to-eco-page', () => {
	it('consolidates static exports and page config into eco.page', async () => {
		const input = readFixture('full-page', 'input');
		const expected = readFixture('full-page', 'output');
		expect(await runTransform(input)).toBe(expected);
	});

	it('leaves files that already use eco.page unchanged', async () => {
		const input = readFixture('already-migrated', 'input');
		expect(await runTransform(input)).toBeNull();
	});

	it('leaves pages without a render body unchanged', async () => {
		const input = readFixture('unsupported', 'input');
		expect(await runTransform(input)).toBeNull();
	});

	it('does not treat object prototype keys like toString as legacy static exports', async () => {
		const input = readFixture('export-object-prototype-key', 'input');
		const expected = readFixture('export-object-prototype-key', 'output');
		expect(await runTransform(input)).toBe(expected);
	});
});

describe('migrate-to-eco-page parser', () => {
	it('uses the tsx parser', () => {
		expect(parser).toBe('tsx');
	});
});
