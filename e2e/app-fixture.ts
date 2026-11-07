import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';
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

/** The server a project starts for each worker, set through `use.appOptions` in `playwright.config.ts`. */
export type AppOptions = {
	/** Repository-relative folder of the app to copy, such as `playground/kitchen-sink`. */
	source: string;
	/**
	 * What the worker serves. Defaults to `dev`, which runs `ecopages dev` in the copy.
	 *
	 * @remarks
	 * `moved-start` runs `ecopages build` in the copy, moves the whole folder to another directory, and runs
	 * `ecopages start` there, so a test sees whether a build still works once it no longer sits where it was built.
	 */
	serve?: 'dev' | 'moved-start';
	/** Runtime passed to the CLI. Defaults to `node`. */
	runtime?: 'bun' | 'node';
	/** Extra environment for the dev server. */
	env?: Record<string, string>;
	/** Config file of the copy, relative to the app root, passed to the server as `ECOPAGES_CONFIG_FILE`. */
	configFile?: string;
	/** Longest the server may take to print its ready line. Defaults to 120 s. */
	readyTimeoutMs?: number;
};

/** A running server and the private copy of the app it serves. */
export type App = {
	/** Absolute folder of this worker's copy. Specs that edit sources edit files under it. */
	dir: string;
	/** Absolute folder `ecopages build` ran in, which no longer exists, when `serve` is `moved-start`. */
	builtDir?: string;
	/** Origin the server listens on. */
	url: string;
	/** Captured tail of the worker's dev-server output, useful when a browser assertion fails. */
	getServerOutput(): string;
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
			reject(new Error(`The server did not print its ready line within ${timeoutMs} ms.\n${readTail()}`));
		}, timeoutMs);
		const onData = () => {
			if (SERVER_READY_LINE.test(readTail())) {
				cleanup();
				resolve();
			}
		};
		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			cleanup();
			reject(new Error(`The server exited (${signal ?? code}) before it was ready.\n${readTail()}`));
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
 * Runs `ecopages build` in `builtDir`, then moves that folder to `dir`, replacing any earlier copy.
 *
 * @remarks
 * The rename leaves nothing at `builtDir`, so the started server cannot read a file through a path the build
 * recorded. Both folders sit side by side, so the relative links a workspace build writes still resolve.
 */
function buildAndMove(builtDir: string, dir: string, runtime: string, env: NodeJS.ProcessEnv): void {
	const build = spawnSync(process.execPath, [ecopagesCli, 'build', '--runtime', runtime], {
		cwd: builtDir,
		env,
		encoding: 'utf8',
	});
	if (build.status !== 0) {
		rmSync(builtDir, { recursive: true, force: true });
		throw new Error(
			`ecopages build exited with ${build.status}.\n${`${build.stdout}${build.stderr}`.slice(-OUTPUT_TAIL_CHARS)}`,
		);
	}
	rmSync(dir, { recursive: true, force: true });
	renameSync(builtDir, dir);
}

/**
 * `test` for specs that run against a server of their own.
 *
 * @remarks
 * `app` is a worker-scoped fixture: the first test of a worker that needs it copies the project's
 * `appOptions.source` to `.e2e-tmp/<project>-w<workerIndex>`, starts `ecopages dev` there on a free port,
 * and waits for the ready line. With `serve: 'moved-start'` it builds the copy in `<that folder>-built`, moves it to
 * that folder and runs `ecopages start` instead. `baseURL` points at that server, so `page` and `request` reach it, and a worker
 * whose tests never ask for a page or for `app` starts nothing. Every worker has its own copy, so specs edit
 * files under `app.dir` and parallel workers never see each other's edits. The server stops and the copy is
 * removed when the worker ends, unless `ECOPAGES_KEEP_E2E_TMP=true`; a copy that a killed run left behind is
 * replaced when the same worker index starts again. The folder is keyed by the worker index, which is unique per worker process, not by the parallel index:
 * a worker restarted after a failure reuses the parallel index while the old one may still be removing its copy. The server runs in its own process group so the stop reaches the
 * runtime processes the CLI starts.
 *
 * The server does not inherit `NODE_PATH`. pnpm's bin shims, which start Playwright, set it to the store's hoisted
 * `node_modules`, where every installed package resolves; without it, a package resolves only where the app's
 * install puts it, as for `node <cli> dev`.
 */
export const test = base.extend<{}, { appOptions: AppOptions | undefined; app: App }>({
	appOptions: [undefined, { option: true, scope: 'worker' }],

	app: [
		async ({ appOptions }, use, workerInfo) => {
			if (!appOptions) {
				throw new Error(`Project "${workerInfo.project.name}" does not set use.appOptions, so it has no app.`);
			}

			const dir = path.join(repoRoot, '.e2e-tmp', `${workerInfo.project.name}-w${workerInfo.workerIndex}`);
			const runtime = appOptions.runtime ?? 'node';
			const serve = appOptions.serve ?? 'dev';
			const { NODE_PATH: _inheritedNodePath, ...inheritedEnv } = process.env;
			const envFor = (appDir: string): NodeJS.ProcessEnv => ({
				...inheritedEnv,
				NODE_ENV: serve === 'dev' ? 'development' : 'production',
				...(appOptions.configFile
					? { [ECOPAGES_CONFIG_FILE_ENV]: path.join(appDir, appOptions.configFile) }
					: {}),
				...appOptions.env,
			});
			const builtDir = serve === 'moved-start' ? `${dir}-built` : undefined;
			copyFixtureApp(path.join(repoRoot, appOptions.source), builtDir ?? dir);
			if (builtDir) buildAndMove(builtDir, dir, runtime, envFor(builtDir));
			const port = await pickFreePort();
			const command = serve === 'dev' ? 'dev' : 'start';
			const child = spawn(
				process.execPath,
				[ecopagesCli, command, '--runtime', runtime, '--port', String(port)],
				{
					cwd: dir,
					detached: true,
					env: envFor(dir),
					stdio: ['ignore', 'pipe', 'pipe'],
				},
			);

			let tail = '';
			const collect = (chunk: Buffer) => {
				tail = `${tail}${chunk}`.slice(-OUTPUT_TAIL_CHARS);
			};
			child.stdout?.on('data', collect);
			child.stderr?.on('data', collect);

			try {
				await waitForReadyLine(child, () => tail, appOptions.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
				await use({ dir, builtDir, url: `http://localhost:${port}`, getServerOutput: () => tail });
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
