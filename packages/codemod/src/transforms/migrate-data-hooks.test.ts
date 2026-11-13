import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jscodeshift from 'jscodeshift';
import prettier from 'prettier';
import { describe, expect, it, vi } from 'vitest';
import transform from './migrate-data-hooks.ts';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'migrate-data-hooks');

const j = jscodeshift.withParser('tsx');

async function runTransform(source: string, report: (message: string) => void = () => {}): Promise<string | null> {
	const fixturePath = 'fixture.tsx';
	const result = transform({ path: fixturePath, source }, { jscodeshift: j, report } as never, {});
	if (!result) {
		return null;
	}
	const config = await prettier.resolveConfig(fixturePath);
	return prettier.format(result, { ...config, parser: 'typescript' });
}

function readFixture(name: string, extension: 'input' | 'output'): string {
	return readFileSync(path.join(fixturesDir, `${name}.${extension}.tsx`), 'utf-8');
}

describe('migrate-data-hooks', () => {
	it.each(['envelopes', 'expression-body', 'method-and-shorthand', 'computed-return'])(
		'renames the hooks and drops the envelopes in %s',
		async (name) => {
			expect(await runTransform(readFixture(name, 'input'))).toBe(readFixture(name, 'output'));
		},
	);

	it('leaves a page that already uses props and paths unchanged', async () => {
		expect(await runTransform(readFixture('already-migrated', 'input'))).toBeNull();
	});

	it('leaves a hook it cannot resolve unchanged and reports it', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('unresolvable', 'input'), report)).toBeNull();
		expect(report).toHaveBeenCalledWith(expect.stringContaining('staticProps'));
	});

	it('leaves a synchronous hook with a computed return unchanged and reports it', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('sync-unresolvable', 'input'), report)).toBeNull();
		expect(report).toHaveBeenCalledOnce();
	});

	it('does not rename GetStaticProps imported from another package', async () => {
		expect(await runTransform(readFixture('foreign-types', 'input'))).toBeNull();
	});

	it('is idempotent', async () => {
		const once = await runTransform(readFixture('envelopes', 'input'));
		expect(once).not.toBeNull();
		expect(await runTransform(once as string)).toBeNull();
	});
});
