import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { createClientGraphBoundaryPlugin } from './boundary-plugin.ts';
import { RolldownBuildAdapter } from '../../../../core/src/build/rolldown/rolldown-build-adapter.ts';
import { assertBuildSucceeded } from '../../../../core/src/build/build-log.ts';

const parses = vi.hoisted(() => new Map<string, number>());

vi.mock('@ecopages/core/build', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@ecopages/core/build')>();
	return {
		...actual,
		parseModuleSource: (...args: Parameters<typeof actual.parseModuleSource>) => {
			parses.set(args[0], (parses.get(args[0]) ?? 0) + 1);
			return actual.parseModuleSource(...args);
		},
	};
});

it('parses each module once in a build with one boundary instance per React entry', async () => {
	const tempDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-client-graph-parse-')));
	const islands = ['a', 'b', 'c'].map((name) => path.join(tempDir, `island-${name}.tsx`));
	const helper = path.join(tempDir, 'helper.ts');
	writeFileSync(helper, 'export const label = (name) => `island-${name}`;');
	for (const island of islands) {
		writeFileSync(
			island,
			`import { label } from './helper';\nexport default () => label(${JSON.stringify(island)});`,
		);
	}

	try {
		const result = await new RolldownBuildAdapter().build({
			environment: 'browser',
			entrypoints: Object.fromEntries(islands.map((island, index) => [`island${index}`, island])),
			outdir: path.join(tempDir, 'dist'),
			root: tempDir,
			target: 'browser',
			format: 'esm',
			splitting: true,
			writeToDisk: false,
			plugins: islands.map((entrypointFile) =>
				createClientGraphBoundaryPlugin({
					absWorkingDir: tempDir,
					projectRoot: tempDir,
					entrypointFile,
					groupedEntrypointFiles: islands,
				}),
			),
		});

		assertBuildSucceeded(result, 'Build failed');
		expect(Object.fromEntries([...parses].filter(([filePath]) => filePath.startsWith(tempDir)))).toEqual(
			Object.fromEntries([...islands, helper].map((filePath) => [filePath, 1])),
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
