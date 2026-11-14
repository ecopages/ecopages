import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const oxlintBin = path.join(repositoryRoot, 'node_modules/oxlint/bin/oxlint');

const FOLDER_CHECKS = [
	"import path from 'node:path';",
	"export const viewsDir = (srcDir: string) => path.join(srcDir, 'views');",
	"export const inLayouts = (file: string) => file.includes('/layouts/');",
	'export const inPages = (file: string) => /\\/pages\\//.test(file);',
	'export const inComponents = (file: string, root: string) => file.startsWith(`${root}/components/`);',
	"export const segment = (file: string) => file.split('/').includes('pages');",
	"export const windows = (file: string) => file.includes('\\\\layouts\\\\');",
	'export const either = (file: string) => /[\\\\/]views[\\\\/]/.test(file);',
	'',
].join('\n');

const NAMES_NOT_CHECKS = [
	"import { layout } from '../layouts/base-layout';",
	"export type Keys = Pick<{ layouts: string; views: string }, 'layouts'>;",
	"export const config = { layouts: [], 'views': 1 };",
	"export const read = (page: { layouts?: string[] }) => page['layouts'];",
	"export const message = 'Layouts and views are found from references.';",
	"export const lazy = () => import('../components/card');",
	'export { layout };',
	'',
].join('\n');

type Diagnostic = { code: string; filename: string; labels: Array<{ span: { line: number } }> };

/** Lints `files` under a copy of the repository's `.oxlintrc.json` and returns `rule@file:line` entries. */
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
		.filter((diagnostic) => diagnostic.code.includes('ecopages-roles'))
		.map(
			(diagnostic) =>
				`${diagnostic.code}@${diagnostic.filename.replaceAll('\\', '/')}:${diagnostic.labels[0].span.line}`,
		)
		.sort();
}

describe('folder role guard', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), 'ecopages-roles-lint-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test('package code may not decide a file role from a pages, layouts, components or views folder', async () => {
		const file = 'packages/example/src/folder-checks.ts';

		const reported = await lint(root, { [file]: FOLDER_CHECKS });

		expect(reported).toEqual(
			[2, 3, 4, 5, 6, 7, 8].map((line) => `ecopages-roles(no-folder-role-check)@${file}:${line}`).sort(),
		);
	});

	test('property names, imports, types and prose are not folder checks', async () => {
		const reported = await lint(root, { 'packages/example/src/names.ts': NAMES_NOT_CHECKS });

		expect(reported).toEqual([]);
	});

	test('the pages directory default, the file role module, tests and code outside package sources are exempt', async () => {
		const reported = await lint(root, {
			'packages/core/src/router/server/pages-dir.ts': FOLDER_CHECKS,
			'packages/core/src/utils/file-roles.ts': FOLDER_CHECKS,
			'packages/example/src/folder-checks.test.ts': FOLDER_CHECKS,
			'packages/example/src/test/folder-checks.ts': FOLDER_CHECKS,
			'playground/example/src/folder-checks.ts': FOLDER_CHECKS,
		});

		expect(reported).toEqual([]);
	});
});
