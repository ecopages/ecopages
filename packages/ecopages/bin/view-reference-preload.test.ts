import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createLaunchPlan } from './launch-plan.js';

const tsxLoader = import.meta.resolve('tsx/esm');
const viewReferencePreload = import.meta.resolve('./view-reference-preload.js');
const viewReferencePreloadPath = fileURLToPath(viewReferencePreload);

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
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imported-view-entry-preload-'));
			roots.push(rootDir);
			const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
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
				'throw new Error("the view source must not run");\n',
				'utf8',
			);

			const previousCwd = process.cwd();
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
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imported-view-preload-'));
			roots.push(rootDir);
			const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
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
			fs.writeFileSync(viewPath, 'throw new Error("the view source must not run");\n', 'utf8');
			fs.writeFileSync(
				path.join(rootDir, 'entry.ts'),
				[
					"import view from './view.kita.tsx';",
					"const isRef = view?.[Symbol.for('ecopages.view-reference')] === true;",
					'console.log(JSON.stringify({ isRef, filePath: view.filePath }));',
				].join('\n'),
				'utf8',
			);

			const previousCwd = process.cwd();
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
				expect(payload.filePath).toBe(fs.realpathSync(viewPath));
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
});
