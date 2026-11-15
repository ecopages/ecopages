import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { assertBuildSucceeded } from '../build-log.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';

let workDir: string;

beforeEach(() => {
	workDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'file-role-grammar-test-')));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function write(filename: string, source: string): string {
	const filePath = path.join(workDir, 'src', filename);
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, source);
	return filePath;
}

function build(entrypoint: string, environment: 'browser' | 'server' = 'server') {
	return new RolldownBuildAdapter().build({
		environment,
		entrypoints: { main: entrypoint },
		outdir: path.join(workDir, 'dist'),
		root: workDir,
	});
}

describe('file role grammar', () => {
	test.each(['server', 'browser'] as const)(
		'fails a %s build with a role segment before a template extension',
		async (environment) => {
			write('components/card.server.kita.tsx', 'export const card = 1;\n');
			const entry = write(
				'main.ts',
				"import { card } from './components/card.server.kita.tsx';\nconsole.log(card);\n",
			);

			const result = await build(entry, environment);

			if (result.success) throw new Error('Expected the build to fail');
			const message = result.logs.map((log) => log.message).join('\n');
			expect(message).toContain('components/card.server.kita.tsx');
			expect(message).toContain('<name>.server.<ts|tsx|js|jsx>');
		},
	);

	test('builds well-formed role names and ordinary names', async () => {
		write('components/card.server.ts', 'export const card = 1;\n');
		write('components/server.tsx', 'export const server = 1;\n');
		write('components/nav.script.ts', 'export const nav = 1;\n');
		const entry = write(
			'main.ts',
			[
				"import { card } from './components/card.server.ts';",
				"import { server } from './components/server.tsx';",
				"import { nav } from './components/nav.script.ts';",
				'console.log(card, server, nav);',
			].join('\n'),
		);

		assertBuildSucceeded(await build(entry), 'role names build');
	});

	test('recovers once the file is renamed', async () => {
		const bad = write('components/card.script.lit.ts', 'export const card = 1;\n');
		const entry = write('main.ts', "import { card } from './components/card.script.lit.ts';\nconsole.log(card);\n");
		expect((await build(entry)).success).toBe(false);

		rmSync(bad);
		write('components/card.lit.ts', 'export const card = 1;\n');
		writeFileSync(entry, "import { card } from './components/card.lit.ts';\nconsole.log(card);\n");

		assertBuildSucceeded(await build(entry), 'renamed build');
	});
});
