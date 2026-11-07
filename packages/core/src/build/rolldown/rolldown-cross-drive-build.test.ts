import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';

import { afterEach, describe, expect, test } from 'vitest';
import { assertBuildSucceeded } from '../build-log.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';

const cleanups: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

/**
 * Maps a free drive letter to `target` with `subst`, which makes a distinct drive on Windows without a second disk.
 * Returns undefined when no letter is free or `subst` is unavailable.
 */
function mountDrive(target: string): string | undefined {
	for (const letter of 'ZYXWVUTSRQ') {
		const drive = `${letter}:`;
		if (existsSync(`${drive}\\`)) continue;
		try {
			execFileSync('subst', [drive, target], { stdio: 'ignore' });
		} catch {
			continue;
		}
		cleanups.push(() => execFileSync('subst', [drive, '/d'], { stdio: 'ignore' }));
		return `${drive}\\`;
	}
	return undefined;
}

describe('RolldownBuildAdapter across drives', () => {
	test.skipIf(process.platform !== 'win32')(
		'preserveModules names a module on another drive than the preserveModulesRoot',
		async (context) => {
			const workDir = mkdtempSync(path.join(tmpdir(), 'rolldown-cross-drive-'));
			cleanups.push(() => rmSync(workDir, { recursive: true, force: true }));
			const sharedDir = path.join(workDir, 'shared');
			const appDir = path.join(workDir, 'app');
			mkdirSync(sharedDir);
			mkdirSync(appDir);
			writeFileSync(path.join(sharedDir, 'component-internal-state.ts'), 'export const state = 1;\n');
			const appRoot = mountDrive(appDir);
			if (!appRoot) {
				context.skip('No free drive letter could be mapped with subst, so no second drive exists.');
				return;
			}
			const sharedImport = path.join(sharedDir, 'component-internal-state.ts').replaceAll('\\', '/');
			const entrypoint = path.join(appRoot, 'entry.ts');
			writeFileSync(entrypoint, `import { state } from ${JSON.stringify(sharedImport)};\nexport { state };\n`);
			const outdir = path.join(workDir, 'dist');

			const result = await new RolldownBuildAdapter().build({
				environment: 'server' as const,
				entrypoints: { entry: entrypoint },
				outdir,
				target: 'node',
				format: 'esm',
				preserveModules: true,
				preserveModulesRoot: appRoot,
				naming: '[name]-[hash].[ext]',
				root: appRoot,
			});

			assertBuildSucceeded(result, 'Build failed');
			const outputs = Object.keys(result.outputGraph).map((outputPath) => path.relative(outdir, outputPath));
			expect(outputs.length).toBeGreaterThan(1);
			expect(outputs.filter((output) => output.includes('/'))).toEqual([]);
		},
	);
});
