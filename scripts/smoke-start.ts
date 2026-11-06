import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const projectDir = path.resolve(process.argv[2] ?? '.');
const readyTimeoutMs = 120_000;
const ecopages = process.platform === 'win32' ? 'ecopages.cmd' : 'ecopages';
const bin = path.join(projectDir, 'node_modules', '.bin', ecopages);
const shell = process.platform === 'win32';

/**
 * Production smoke for a fixture app: `ecopages build`, then `ecopages start` under Node, then a 200 check on `/`.
 *
 * @remarks
 * Written in Node so the same script runs on Linux, macOS and Windows. The server is stopped through
 * `taskkill /T` on Windows because `child.kill` would leave the CLI supervisor's child running.
 */
function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, () => {
			const { port } = server.address() as net.AddressInfo;
			server.close(() => resolve(port));
		});
	});
}

const build = spawnSync(bin, ['build'], { cwd: projectDir, stdio: 'inherit', shell });
if (build.status !== 0) throw new Error(`ecopages build exited with ${build.status}`);

const port = await findFreePort();
let output = '';
const child = spawn(bin, ['start', '--port', String(port)], {
	cwd: projectDir,
	stdio: ['ignore', 'pipe', 'pipe'],
	shell,
	detached: !shell,
});
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));

function stop(): void {
	if (child.pid === undefined || child.exitCode !== null) return;
	if (shell) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
	else
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch {}
}

try {
	const deadline = Date.now() + readyTimeoutMs;
	let response: Response | undefined;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error(`start exited with ${child.exitCode} before serving\n${output}`);
		response = await fetch(`http://localhost:${port}/`).catch(() => undefined);
		if (response) break;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	if (!response) throw new Error(`start did not serve / within ${readyTimeoutMs / 1000}s\n${output}`);
	if (response.status !== 200) throw new Error(`GET / returned ${response.status}\n${output}`);
	console.log(`PASS GET / returned 200 on port ${port}`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	stop();
}
