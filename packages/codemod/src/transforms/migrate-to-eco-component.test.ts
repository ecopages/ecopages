import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jscodeshift from 'jscodeshift';
import prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import transform, { parser } from './migrate-to-eco-component.ts';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'migrate-to-eco-component');

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

describe('migrate-to-eco-component', () => {
	it('migrates a named export with direct EcoComponent props type', async () => {
		const input = readFixture('named-direct-props', 'input');
		const expected = readFixture('named-direct-props', 'output');
		expect(await runTransform(input)).toBe(expected);
	});

	it('migrates nested PageProps type parameters', async () => {
		const input = readFixture('nested-page-props', 'input');
		const expected = readFixture('nested-page-props', 'output');
		expect(await runTransform(input)).toBe(expected);
	});

	it('leaves files that already use eco.component unchanged', async () => {
		const input = readFixture('already-migrated', 'input');
		expect(await runTransform(input)).toBeNull();
	});

	it('leaves unsupported patterns without a config assignment unchanged', async () => {
		const input = readFixture('unsupported', 'input');
		expect(await runTransform(input)).toBeNull();
	});
});

describe('migrate-to-eco-component parser', () => {
	it('uses the tsx parser', () => {
		expect(parser).toBe('tsx');
	});
});
