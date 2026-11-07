import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLaunchPlan } from './launch-plan.js';

const tsxLoader = import.meta.resolve('tsx/esm');
const viewReferencePreload = import.meta.resolve('./view-reference-preload.js');
const viewReferencePreloadPath = path.fromFileUrl(viewReferencePreload);

describe('view-reference preload', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it.each(['node', 'bun'] as const)(
		'keeps the server entry as a real module when an Integration owns .ts (%s)',
		async (runtime) => {
			const rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'imported-view-entry-preload-')));
			roots.push(rootDir);
			const repoRoot = path.fromFileUrl(new URL('../../..', import.meta.url));
			fs.mkdirSync(path.join(rootDir, 'node_modules/@ecopages'), { recursive: true });
			fs.symlinkSync(
				path.join(repoRoot, 'packages/core'),
				path.join(rootDir, 'node_modules/@ecopages/core'),
				'dir',
			);
			fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }));
			fs.writeFileSync(
				path.join(rootDir, 'eco.config.ts'),
				['export default {', "\tintegrations: [{ name: 'string', extensions: ['.ts'] }],", '};'].join('\n'),
				'utf8',
			);
			fs.writeFileSync(
				path.join(rootDir, 'entry.ts'),
				[
					"import view from './view.ts';",
					'console.log("entry-ran");',
					"console.log(JSON.stringify({ isRef: view?.[Symbol.for('ecopages.view-reference')] === true }));",
				].join('\n'),
				'utf8',
			);
			fs.writeFileSync(
				path.join(rootDir, 'view.ts'),
				'throw new Error("the view source must not run");\nexport default {};\n',
				'utf8',
			);

			const previousCwd = path.cwd();
			process.chdir(rootDir);
			try {
				const plan = await createLaunchPlan([], { runtime }, 'entry.ts', 'dev');
				const result = spawnSync(plan.command, plan.commandArgs, {
					cwd: rootDir,
					encoding: 'utf8',
					env: plan.env,
				});

				expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
				expect(result.stdout).toContain('entry-ran');
				expect(result.stdout).toContain('"isRef":true');
			} finally {
				process.chdir(previousCwd);
			}
		},
	);

	it.each(['node', 'bun'] as const)(
		'turns an Integration-owned import into a view reference without evaluating the file (%s)',
		async (runtime) => {
			const rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'imported-view-preload-')));
			roots.push(rootDir);
			const repoRoot = path.fromFileUrl(new URL('../../..', import.meta.url));
			fs.mkdirSync(path.join(rootDir, 'node_modules/@ecopages'), { recursive: true });
			fs.symlinkSync(
				path.join(repoRoot, 'packages/core'),
				path.join(rootDir, 'node_modules/@ecopages/core'),
				'dir',
			);
			fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ type: 'module' }));
			const viewPath = path.join(rootDir, 'view.kita.tsx');
			fs.writeFileSync(
				path.join(rootDir, 'eco.config.ts'),
				['export default {', "\tintegrations: [{ name: 'kitajs', extensions: ['.kita.tsx'] }],", '};'].join(
					'\n',
				),
				'utf8',
			);
			fs.writeFileSync(
				viewPath,
				'throw new Error("the view source must not run");\nexport default {};\n',
				'utf8',
			);
			fs.writeFileSync(
				path.join(rootDir, 'entry.ts'),
				[
					"import view from './view.kita.tsx';",
					"const isRef = view?.[Symbol.for('ecopages.view-reference')] === true;",
					'console.log(JSON.stringify({ isRef, filePath: view.filePath }));',
				].join('\n'),
				'utf8',
			);

			const previousCwd = path.cwd();
			process.chdir(rootDir);
			try {
				const plan = await createLaunchPlan([], { runtime }, 'entry.ts', 'dev');
				const result = spawnSync(plan.command, plan.commandArgs, {
					cwd: rootDir,
					encoding: 'utf8',
					env: plan.env,
				});

				expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
				const payload = JSON.parse(result.stdout.trim()) as { isRef: boolean; filePath: string };
				expect(payload.isRef).toBe(true);
				expect(payload.filePath).toBe(path.fromNative(fs.realpathSync(viewPath)));
				if (runtime === 'node') {
					expect(plan.commandArgs).toContain(viewReferencePreload);
					expect(plan.commandArgs).toContain(tsxLoader);
				} else {
					expect(plan.commandArgs).toEqual(['run', '--preload', viewReferencePreloadPath, 'entry.ts']);
				}
			} finally {
				process.chdir(previousCwd);
			}
		},
	);

	/** Runs `entry.ts` through the preload in an app whose one Integration owns `.tsx`, and returns its parsed output. */
	async function runTsxEntry(runtime: 'node' | 'bun', files: Record<string, string>): Promise<unknown> {
		const rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'imported-view-exports-preload-')));
		roots.push(rootDir);
		const repoRoot = path.fromFileUrl(new URL('../../..', import.meta.url));
		fs.mkdirSync(path.join(rootDir, 'node_modules/@ecopages'), { recursive: true });
		fs.symlinkSync(path.join(repoRoot, 'packages/core'), path.join(rootDir, 'node_modules/@ecopages/core'), 'dir');
		const appFiles: Record<string, string> = {
			'package.json': JSON.stringify({ type: 'module' }),
			'eco.config.ts': "export default { integrations: [{ name: 'jsx', extensions: ['.tsx'] }] };\n",
			...files,
		};
		for (const [relativePath, source] of Object.entries(appFiles)) {
			fs.mkdirSync(path.dirname(path.join(rootDir, relativePath)), { recursive: true });
			fs.writeFileSync(path.join(rootDir, relativePath), source, 'utf8');
		}

		const previousCwd = path.cwd();
		process.chdir(rootDir);
		try {
			const plan = await createLaunchPlan([], { runtime }, 'entry.ts', 'dev');
			const result = spawnSync(plan.command, plan.commandArgs, { cwd: rootDir, encoding: 'utf8', env: plan.env });
			expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
			return JSON.parse(result.stdout.trim());
		} finally {
			process.chdir(previousCwd);
		}
	}

	const SEARCH_ICON_SOURCE = [
		'export type SearchIconProps = { label: string };',
		'export function SearchIcon({ label }: SearchIconProps) {',
		'\treturn `icon:${label}`;',
		'}',
	].join('\n');

	describe.each(['./search-icon', './search-icon.tsx'])('a barrel that imports %s', (specifier) => {
		it.each(['node', 'bun'] as const)(
			'keeps the export of the plain .tsx component it re-exports (%s)',
			async (runtime) => {
				const output = await runTsxEntry(runtime, {
					'search/search-icon.tsx': SEARCH_ICON_SOURCE,
					'search/index.ts': `export { SearchIcon, type SearchIconProps } from '${specifier}';\n`,
					'entry.ts': [
						"import { SearchIcon } from './search/index.ts';",
						"console.log(JSON.stringify({ icon: SearchIcon({ label: 'find' }) }));",
					].join('\n'),
				});

				expect(output).toEqual({ icon: 'icon:find' });
			},
		);
	});

	it.each(['node', 'bun'] as const)(
		'turns a view imported through a tsconfig alias into a reference to the file (%s)',
		async (runtime) => {
			const output = (await runTsxEntry(runtime, {
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						allowImportingTsExtensions: true,
						baseUrl: '.',
						paths: { '@/*': ['./src/*'] },
					},
				}),
				'src/views/post.tsx': 'throw new Error("the view source must not run");\nexport default {};\n',
				'entry.ts': [
					"import view from '@/views/post.tsx';",
					"const isRef = view?.[Symbol.for('ecopages.view-reference')] === true;",
					'console.log(JSON.stringify({ isRef, filePath: view.filePath }));',
				].join('\n'),
			})) as { isRef: boolean; filePath: string };

			expect(output.isRef).toBe(true);
			expect(path.basename(output.filePath)).toBe('post.tsx');
			expect(fs.existsSync(output.filePath)).toBe(true);
		},
	);
});
