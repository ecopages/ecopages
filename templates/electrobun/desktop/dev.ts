import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./bin/cli.js', import.meta.resolve('ecopages/package.json')));
const processHandle = Bun.spawn(['electrobun', 'dev'], {
	env: { ...process.env, WORKSPACE_DEV_ROOT: process.cwd(), WORKSPACE_DEV_CLI: cli },
	stdin: 'inherit',
	stdout: 'inherit',
	stderr: 'inherit',
});
process.exitCode = await processHandle.exited;
