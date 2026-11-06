import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const listPath = path.join(import.meta.dirname, 'windows-vitest-excludes.txt');
const excludes = readFileSync(listPath, 'utf8')
	.split(/\r?\n/u)
	.filter((line) => line.trim() !== '' && !line.startsWith('#'));

/**
 * Runs the non-browser vitest projects with the files listed in `windows-vitest-excludes.txt` left out.
 *
 * @remarks
 * The `browser` project needs a Playwright Chromium and is not part of the Windows job. The excluded files
 * are known Windows failures that each have a tracking issue; the list shrinks as they are fixed.
 */
const args = [
	'exec',
	'vitest',
	'run',
	'--project',
	'shared-core',
	'--project',
	'docs',
	'--project',
	'docs-starter',
	'--project',
	'llm-wiki',
];
const result = spawnSync('pnpm', args, {
	stdio: 'inherit',
	shell: process.platform === 'win32',
	env: { ...process.env, ECOPAGES_VITEST_EXCLUDE: excludes.join('\n') },
});
process.exit(result.status ?? 1);
