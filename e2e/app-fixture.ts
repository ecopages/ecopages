import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import path from 'node:path';
import { test as base } from '@playwright/test';
import { copyFixtureApp } from '../packages/core/__fixtures__/app/copy-fixture-app.ts';
import { ECOPAGES_CONFIG_FILE_ENV } from '../packages/core/src/config/resolve-eco-config-path.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const ecopagesCli = path.join(repoRoot, 'packages', 'ecopages', 'bin', 'cli.js');
const SERVER_READY_LINE = /(?:Bun|Node) server running at/;
const DEFAULT_READY_TIMEOUT_MS = 120_000;
const STOP_GRACE_MS = 5_000;
const OUTPUT_TAIL_CHARS = 8_000;

/** The dev server a project starts for each worker, set through `use.appOptions` in `playwright.config.ts`. */
export type AppOptions = {
	/** Repository-relative folder of the app to copy, such as `playground/kitchen-sink`. */
	source: string;
	/** Runtime passed to `ecopages dev`. Defaults to `node`. */
	runtime?: 'bun' | 'node';
	/** Extra environment for the dev server. */
	env?: Record<string, string>;
	/** Config file of the copy, relative to the app root, passed to the server as `ECOPAGES_CONFIG_FILE`. */
	configFile?: string;
	/** Longest the server may take to print its ready line. Defaults to 120 s. */
	readyTimeoutMs?: number;
};

/** A running dev server and the private copy of the app it serves. */
export type App = {
	/** Absolute folder of this worker's copy. Specs that edit sources edit files under it. */
	dir: string;
	/** Origin the server listens on. */
	url: string;
};

/**
 * @remarks
 * The port is picked by the OS and released before the server binds it, so another process could take it in
 * between; the server then fails to start and the fixture reports that failure with the server output.
 */
async function pickFreePort(): Promise<number> {
	const probe = createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', resolve);
	});
	const { port } = probe.address() as AddressInfo;
	await new Promise<void>((resolve) => probe.close(() => resolve()));
	return port;
}

function waitForReadyLine(child: ChildProcess, readTail: () => string, timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error(`The dev server did not print its ready line within ${timeoutMs} ms.\n${readTail()}`));
		}, timeoutMs);
		const onData = () => {
			if (SERVER_READY_LINE.test(readTail())) {
				cleanup();
				resolve();
			}
		};
		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			cleanup();
			reject(new Error(`The dev server exited (${signal ?? code}) before it was ready.\n${readTail()}`));
		};
		const cleanup = () => {
			clearTimeout(timer);
			child.stdout?.off('data', onData);
			child.off('exit', onExit);
		};

		child.stdout?.on('data', onData);
		child.once('exit', onExit);
	});
}

async function stopServer(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;

	const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
	const signalGroup = (signal: NodeJS.Signals) => {
		try {
			process.kill(-child.pid!, signal);
		} catch {
			child.kill(signal);
		}
	};

	signalGroup('SIGTERM');
	const killTimer = setTimeout(() => signalGroup('SIGKILL'), STOP_GRACE_MS);
	await exited;
	clearTimeout(killTimer);
}

/**
 * `test` for specs that run against a dev server of their own.
 *
 * @remarks
 * `app` is a worker-scoped fixture: the first test of a worker that needs it copies the project's
 * `appOptions.source` to `.e2e-tmp/<project>-w<parallelIndex>`, starts `ecopages dev` there on a free port,
 * and waits for the ready line. `baseURL` points at that server, so `page` and `request` reach it, and a worker
 * whose tests never ask for a page or for `app` starts nothing. Every worker has its own copy, so specs edit
 * files under `app.dir` and parallel workers never see each other's edits. The server stops and the copy is
 * removed when the worker ends, unless `ECOPAGES_KEEP_E2E_TMP=true`; a copy that a killed run left behind is
 * replaced when the same slot starts again. The server runs in its own process group so the stop reaches the
 * runtime processes the CLI starts.
 */
export const test = base.extend<{}, { appOptions: AppOptions | undefined; app: App }>({
	appOptions: [undefined, { option: true, scope: 'worker' }],

	app: [
		async ({ appOptions }, use, workerInfo) => {
			if (!appOptions) {
				throw new Error(`Project "${workerInfo.project.name}" does not set use.appOptions, so it has no app.`);
			}

			const dir = copyFixtureApp(
				path.join(repoRoot, appOptions.source),
				path.join(repoRoot, '.e2e-tmp', `${workerInfo.project.name}-w${workerInfo.parallelIndex}`),
			);
			const port = await pickFreePort();
			const runtime = appOptions.runtime ?? 'node';
			const child = spawn(process.execPath, [ecopagesCli, 'dev', '--runtime', runtime, '--port', String(port)], {
				cwd: dir,
				detached: true,
				env: {
					...process.env,
					NODE_ENV: 'development',
					...(appOptions.configFile
						? { [ECOPAGES_CONFIG_FILE_ENV]: path.join(dir, appOptions.configFile) }
						: {}),
					...appOptions.env,
				},
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let tail = '';
			const collect = (chunk: Buffer) => {
				tail = `${tail}${chunk}`.slice(-OUTPUT_TAIL_CHARS);
			};
			child.stdout?.on('data', collect);
			child.stderr?.on('data', collect);

			try {
				await waitForReadyLine(child, () => tail, appOptions.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
				await use({ dir, url: `http://localhost:${port}` });
			} finally {
				await stopServer(child);
				if (process.env.ECOPAGES_KEEP_E2E_TMP !== 'true') {
					rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
				}
			}
		},
		{ scope: 'worker', timeout: 180_000 },
	],

	baseURL: async ({ app }, use) => {
		await use(app.url);
	},
});

export { expect } from '@playwright/test';
