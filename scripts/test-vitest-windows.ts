import { spawnSync } from 'node:child_process';

/**
 * Runs every non-browser vitest project, as the Windows CI job does.
 *
 * @remarks
 * The `browser` project needs a Playwright Chromium and is not part of the Windows job.
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
});
process.exit(result.status ?? 1);
