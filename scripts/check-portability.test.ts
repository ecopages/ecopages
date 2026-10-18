import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkCoreLayering } from './check-portability.ts';

describe('core layering check', () => {
	let repositoryRoot: string;
	let sourceRoot: string;

	beforeEach(async () => {
		repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'ecopages-core-layering-'));
		sourceRoot = path.join(repositoryRoot, 'packages/core/src');
		await mkdir(path.join(sourceRoot, 'types'), { recursive: true });
		await mkdir(path.join(sourceRoot, 'build'), { recursive: true });
		await writeFile(
			path.join(repositoryRoot, 'packages/core/package.json'),
			JSON.stringify({
				name: '@ecopages/core',
				exports: {
					'./build/value': {
						types: './src/build/value.ts',
						default: './src/build/value.ts',
					},
				},
			}),
		);
		await mkdir(path.join(repositoryRoot, 'scripts'), { recursive: true });
		await writeFile(path.join(repositoryRoot, 'scripts/core-layering-allowlist.json'), '[]');
		await writeFile(
			path.join(sourceRoot, 'build/value.ts'),
			'export type Value = number;\nexport const value = 1;',
		);
	});

	afterEach(async () => {
		await rm(repositoryRoot, { recursive: true, force: true });
	});

	test('rejects empty-binding imports and runtime resolution calls to a higher layer', async () => {
		await writeFile(path.join(sourceRoot, 'types/empty-import.ts'), "import {} from '../build/value.ts';");
		await writeFile(path.join(sourceRoot, 'types/empty-export.ts'), "export {} from '../build/value.ts';");
		await writeFile(
			path.join(sourceRoot, 'types/runtime-resolve.ts'),
			"const target = import.meta.resolve('../build/value.ts');",
		);

		const violations = await checkCoreLayering(repositoryRoot);

		expect(
			violations
				.map(({ relativePath, text }) => [relativePath, text])
				.sort(([left], [right]) => left.localeCompare(right)),
		).toEqual([
			['packages/core/src/types/empty-export.ts', "export {} from '../build/value.ts';"],
			['packages/core/src/types/empty-import.ts', "import {} from '../build/value.ts';"],
			['packages/core/src/types/runtime-resolve.ts', "const target = import.meta.resolve('../build/value.ts');"],
		]);
	});

	test('recognizes statically known template paths in runtime module calls', async () => {
		const runtimeCalls = [
			['dynamic-import.ts', 'void import(`../build/value.ts`);'],
			['require-call.ts', 'void require(`../build/value.ts`);'],
			['require-resolve.ts', 'void require.resolve(`../build/value.ts`);'],
			['runtime-resolve.ts', 'void import.meta.resolve(`../build/value.ts`);'],
		] as const;

		for (const [fileName, content] of runtimeCalls) {
			await writeFile(path.join(sourceRoot, 'types', fileName), content);
		}

		const violations = await checkCoreLayering(repositoryRoot);
		expect(violations.map(({ relativePath }) => relativePath).sort()).toEqual(
			runtimeCalls.map(([fileName]) => `packages/core/src/types/${fileName}`).sort(),
		);
	});

	test('uses the parent URL when resolving relative runtime calls', async () => {
		const parentFile = path.join(sourceRoot, 'build/anchor.ts');
		const parentUrl = pathToFileURL(parentFile).href;
		await writeFile(parentFile, 'export {};');
		await writeFile(
			path.join(sourceRoot, 'types/custom-parent.ts'),
			`void import.meta.resolve('./value.ts', '${parentUrl}');`,
		);

		const violations = await checkCoreLayering(repositoryRoot);
		expect(violations.map(({ relativePath }) => relativePath)).toEqual([
			'packages/core/src/types/custom-parent.ts',
		]);
	});

	test('does not guess a relative target when the parent URL is dynamic', async () => {
		await writeFile(
			path.join(sourceRoot, 'types/dynamic-parent.ts'),
			"void import.meta.resolve('./value.ts', parentUrl);",
		);

		expect(await checkCoreLayering(repositoryRoot)).toEqual([]);
	});

	test('resolves package self-imports and applies tracked exceptions only to current edges', async () => {
		const sourcePath = 'packages/core/src/types/self-import.ts';
		const sourceFile = path.join(repositoryRoot, sourcePath);
		await writeFile(sourceFile, "import { value } from '@ecopages/core/build/value';");
		await writeFile(
			path.join(repositoryRoot, 'scripts/core-layering-allowlist.json'),
			JSON.stringify([{ from: sourcePath, to: 'packages/core/src/build/value.ts', issue: '#556' }]),
		);

		expect(await checkCoreLayering(repositoryRoot)).toEqual([]);

		await writeFile(sourceFile, 'export const value = 1;');
		const violations = await checkCoreLayering(repositoryRoot);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.message).toContain('Stale allowlist entry');
	});

	test('ignores type-only imports and test modules', async () => {
		await writeFile(
			path.join(sourceRoot, 'types/type-only.ts'),
			"import type { Value } from '../build/value.ts';\nexport type { Value } from '../build/value.ts';",
		);
		await writeFile(
			path.join(sourceRoot, 'types/source.test.browser.ts'),
			"import { value } from '../build/value.ts';",
		);
		await writeFile(
			path.join(sourceRoot, 'types/source.test-helpers.ts'),
			"import { value } from '../build/value.ts';",
		);
		await mkdir(path.join(sourceRoot, 'types/__tests__'), { recursive: true });
		await writeFile(
			path.join(sourceRoot, 'types/__tests__/source.ts'),
			"import { value } from '../../build/value.ts';",
		);

		const violations = await checkCoreLayering(repositoryRoot);
		expect(violations).toEqual([]);
	});

	test('tracks inline type bindings that TypeScript preserves as side-effect imports', async () => {
		await writeFile(
			path.join(sourceRoot, 'types/inline-type-import.ts'),
			"import { type Value } from '../build/value.ts';\nexport type ImportedValue = Value;",
		);
		await writeFile(
			path.join(sourceRoot, 'types/inline-type-export.ts'),
			"export { type Value } from '../build/value.ts';",
		);

		const violations = await checkCoreLayering(repositoryRoot);
		expect(violations.map(({ relativePath }) => relativePath).sort()).toEqual([
			'packages/core/src/types/inline-type-export.ts',
			'packages/core/src/types/inline-type-import.ts',
		]);
	});

	test('reports a value import that has no tracked exception', async () => {
		await writeFile(
			path.join(sourceRoot, 'types/value-import.ts'),
			"import { value } from '../build/value.ts';\nvoid value;",
		);

		const violations = await checkCoreLayering(repositoryRoot);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.message).toContain('cannot import from the higher Build layer');
	});
});
