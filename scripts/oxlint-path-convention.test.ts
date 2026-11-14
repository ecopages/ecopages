import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const oxlintBin = path.join(repositoryRoot, 'node_modules/oxlint/bin/oxlint');

const NATIVE_PATH_SOURCE = [
	"import { createRequire } from 'node:module';",
	"const required = require('node:path');",
	"const created = createRequire(import.meta.url)('node:path');",
	'const requireFromApp = createRequire(import.meta.url);',
	"const bound = requireFromApp('path/posix');",
	"const imported = await import('node:path');",
	'const cwd = process.cwd();',
	'const dirname = import.meta.dirname;',
	'const filename = import.meta.filename;',
	'const url = import.meta.url;',
	"const fs = requireFromApp('node:fs');",
	'export { required, created, bound, imported, cwd, dirname, filename, url, fs };',
	'',
].join('\n');

type Diagnostic = { code: string; filename: string; labels: Array<{ span: { line: number } }> };

/** Lints `files` laid out under a copy of the repository's `.oxlintrc.json` and returns `rule@file:line` entries. */
async function lint(root: string, files: Record<string, string>): Promise<string[]> {
	const config = JSON.parse(await readFile(path.join(repositoryRoot, '.oxlintrc.json'), 'utf8'));
	config.jsPlugins = config.jsPlugins.map((plugin: string) => path.join(repositoryRoot, plugin));
	delete config.$schema;
	await writeFile(path.join(root, '.oxlintrc.json'), JSON.stringify(config));
	for (const [file, source] of Object.entries(files)) {
		await mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await writeFile(path.join(root, file), source);
	}

	let output: string;
	try {
		output = execFileSync(process.execPath, [oxlintBin, '-f', 'json', ...Object.keys(files)], {
			cwd: root,
			encoding: 'utf8',
		});
	} catch (error) {
		output = (error as { stdout: string }).stdout;
	}
	const { diagnostics } = JSON.parse(output) as { diagnostics: Diagnostic[] };
	return diagnostics
		.filter((diagnostic) => /ecopages-path|no-restricted-properties/.test(diagnostic.code))
		.map(
			(diagnostic) =>
				`${diagnostic.code}@${diagnostic.filename.replaceAll('\\', '/')}:${diagnostic.labels[0].span.line}`,
		)
		.sort();
}

describe('path convention lint rules', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), 'ecopages-path-lint-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test('package code may not load node:path dynamically or read native paths from the process or import.meta', async () => {
		const file = 'packages/example/src/native-paths.ts';
		const reported = await lint(root, { [file]: NATIVE_PATH_SOURCE });

		expect(reported).toEqual(
			[
				`ecopages-path(no-native-path-module)@${file}:2`,
				`ecopages-path(no-native-path-module)@${file}:3`,
				`ecopages-path(no-native-path-module)@${file}:5`,
				`ecopages-path(no-native-path-module)@${file}:6`,
				`eslint(no-restricted-properties)@${file}:7`,
				`ecopages-path(no-import-meta-native-path)@${file}:8`,
				`ecopages-path(no-import-meta-native-path)@${file}:9`,
			].sort(),
		);
	});

	test('the path module itself and code outside packages are exempt', async () => {
		const reported = await lint(root, {
			'packages/file-system/src/path.ts': NATIVE_PATH_SOURCE,
			'playground/example/src/native-paths.ts': NATIVE_PATH_SOURCE,
		});

		expect(reported).toEqual([]);
	});
});
