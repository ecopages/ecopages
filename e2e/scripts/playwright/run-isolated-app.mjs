import { spawn } from 'node:child_process';
import { closeSync, cpSync, existsSync, mkdirSync, openSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPlaywrightSubprocessEnv } from '../../playwright/playwright-color-env.mjs';
import { parseArgs } from './run-isolated-app-args.mjs';

export { parseArgs } from './run-isolated-app-args.mjs';

const REMOVE_DIRECTORY_OPTIONS = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 };
const WORKSPACE_PREPARE_TIMEOUT_MS = 120_000;
const WORKSPACE_PREPARE_POLL_MS = 50;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const tempRootDir = path.join(repoRoot, '.e2e-tmp');
const ecopagesCliEntrypoint = path.join(repoRoot, 'packages', 'ecopages', 'bin', 'cli.js');
const keepWorkspace = process.env.ECOPAGES_KEEP_E2E_TMP === 'true';
const wrapperManagesWorkspaceCleanup = process.env.ECOPAGES_MANAGE_ISOLATED_WORKSPACES === 'true';
const excludedTopLevelEntries = new Set(['.e2e', 'node_modules']);
const timingEnabled = process.env.ECOPAGES_E2E_TIMING === 'true';

/**
 * Emits a timestamped `[e2e-server]` marker so parity/CI runs can pinpoint slow
 * server boots (workspace copy vs process spawn) instead of masking them with
 * larger `webServer.timeout` values. Gated by `ECOPAGES_E2E_TIMING` to keep
 * normal runs quiet. Playwright itself owns the "server ready" measurement (it
 * polls the url/port), so this only covers phases this launcher controls.
 */
function logServerTiming(phase, scope) {
	if (!timingEnabled) {
		return;
	}

	console.log(`[e2e-server] ${phase} scope=${scope} at=${Date.now()}`);
}

export function shouldExcludeFromWorkspaceCopy(relativePath) {
	if (!relativePath) {
		return false;
	}

	const topLevelEntry = relativePath.split(path.sep)[0] ?? '';
	if (excludedTopLevelEntries.has(topLevelEntry)) {
		return true;
	}

	// Scoped E2E artifact dirs (dist-bun-dev, .eco-vite-node-preview, etc.)
	if (topLevelEntry === 'dist' || topLevelEntry === '.eco') {
		return true;
	}

	return topLevelEntry.startsWith('dist-') || topLevelEntry.startsWith('.eco-');
}

function getAbsoluteSourceDir(sourceDir) {
	return path.resolve(repoRoot, sourceDir);
}

function getWorkspaceDir(workspace) {
	return path.join(tempRootDir, workspace);
}

function buildCopyFilter(sourceDir) {
	return (sourcePath) => {
		const relativePath = path.relative(sourceDir, sourcePath);
		return !shouldExcludeFromWorkspaceCopy(relativePath);
	};
}

export function removeDirectorySync(targetPath) {
	if (!existsSync(targetPath)) {
		return;
	}

	rmSync(targetPath, REMOVE_DIRECTORY_OPTIONS);
}

function sleepSync(durationMs) {
	const deadline = Date.now() + durationMs;
	while (Date.now() < deadline) {
		// Busy-wait for short workspace setup coordination windows.
	}
}

function getWorkspaceLockPath(workspaceDir) {
	return `${workspaceDir}.prepare-lock`;
}

function releaseWorkspaceLock(lockPath) {
	try {
		unlinkSync(lockPath);
	} catch (error) {
		if (error?.code !== 'ENOENT') {
			throw error;
		}
	}
}

function isWorkspaceReady(markerFile) {
	return existsSync(markerFile);
}

function populateWorkspace(sourceDir, workspaceDir, { sharedWorkspace = false } = {}) {
	const markerFile = path.join(workspaceDir, 'eco.config.ts');
	if (isWorkspaceReady(markerFile)) {
		return;
	}

	if (!sharedWorkspace) {
		removeDirectorySync(workspaceDir);
	} else if (existsSync(workspaceDir) && !isWorkspaceReady(markerFile)) {
		removeDirectorySync(workspaceDir);
	}

	mkdirSync(workspaceDir, { recursive: true });
	cpSync(sourceDir, workspaceDir, {
		recursive: true,
		filter: buildCopyFilter(sourceDir),
	});

	const sourceNodeModulesDir = path.join(sourceDir, 'node_modules');
	const targetNodeModulesDir = path.join(workspaceDir, 'node_modules');
	if (existsSync(sourceNodeModulesDir)) {
		if (existsSync(targetNodeModulesDir)) {
			removeDirectorySync(targetNodeModulesDir);
		}
		symlinkSync(sourceNodeModulesDir, targetNodeModulesDir, 'dir');
	}
}

function withSharedWorkspaceLock(workspaceDir, run) {
	mkdirSync(path.dirname(workspaceDir), { recursive: true });

	const markerFile = path.join(workspaceDir, 'eco.config.ts');
	const lockPath = getWorkspaceLockPath(workspaceDir);
	const deadline = Date.now() + WORKSPACE_PREPARE_TIMEOUT_MS;

	while (Date.now() < deadline) {
		if (isWorkspaceReady(markerFile)) {
			return;
		}

		try {
			const lockHandle = openSync(lockPath, 'wx');
			closeSync(lockHandle);

			try {
				run();
			} finally {
				releaseWorkspaceLock(lockPath);
			}

			return;
		} catch (error) {
			if (error?.code !== 'EEXIST') {
				throw error;
			}

			if (isWorkspaceReady(markerFile)) {
				return;
			}

			sleepSync(WORKSPACE_PREPARE_POLL_MS);
		}
	}

	throw new Error(`Timed out preparing shared Playwright workspace: ${workspaceDir}`);
}

export function prepareWorkspace(sourceDir, workspaceDir) {
	const markerFile = path.join(workspaceDir, 'eco.config.ts');
	if (isWorkspaceReady(markerFile)) {
		return;
	}

	mkdirSync(path.dirname(workspaceDir), { recursive: true });

	if (wrapperManagesWorkspaceCleanup) {
		withSharedWorkspaceLock(workspaceDir, () =>
			populateWorkspace(sourceDir, workspaceDir, { sharedWorkspace: true }),
		);
		return;
	}

	populateWorkspace(sourceDir, workspaceDir);
}

export function buildCommand(options) {
	if (options.host === 'vite') {
		const viteRunner = options.runtime === 'bun' ? 'bunx vite' : 'pnpm exec vite';
		return `${viteRunner} dev --port ${options.port}`;
	}

	const ecopagesCli = `node "${ecopagesCliEntrypoint}"`;

	if (options.mode === 'preview') {
		return `${ecopagesCli} preview --runtime ${options.runtime} --port ${options.port}`;
	}

	return `${ecopagesCli} dev --runtime ${options.runtime} --port ${options.port}`;
}

export function buildEnv(options) {
	const viteBaseUrl = options.host === 'vite' ? `http://localhost:${options.port}` : process.env.ECOPAGES_BASE_URL;

	return createPlaywrightSubprocessEnv({
		ECOPAGES_E2E_ARTIFACT_SCOPE: options.artifactScope,
		...(viteBaseUrl ? { ECOPAGES_BASE_URL: viteBaseUrl } : {}),
		...(options.host === 'vite' ? { ECOPAGES_CROSS_INTEGRATION_HOST: 'vite' } : {}),
		...(options.host === 'ecopages' ? { ECOPAGES_CROSS_INTEGRATION_E2E: 'true' } : {}),
		...(options.artifactScope?.startsWith('cross-integration-hmr')
			? { ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS: '0' }
			: {}),
		NODE_ENV: options.mode === 'preview' ? 'production' : 'development',
	});
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const sourceDir = getAbsoluteSourceDir(options.sourceDir);
	const workspaceDir = getWorkspaceDir(options.workspace);

	logServerTiming('workspace-prepare-start', options.artifactScope);
	prepareWorkspace(sourceDir, workspaceDir);
	logServerTiming('workspace-prepare-done', options.artifactScope);

	let cleanedUp = false;
	let childExited = false;

	function cleanupWorkspace() {
		if (cleanedUp || keepWorkspace || wrapperManagesWorkspaceCleanup) {
			return;
		}

		cleanedUp = true;
		removeDirectorySync(workspaceDir);
	}

	logServerTiming('process-spawn', options.artifactScope);
	const child = spawn(buildCommand(options), {
		cwd: workspaceDir,
		env: buildEnv(options),
		shell: true,
		stdio: 'inherit',
	});

	child.on('error', (error) => {
		cleanupWorkspace();
		throw error;
	});

	function forwardSignal(signal) {
		if (childExited) {
			return;
		}

		child.kill(signal);
	}

	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
		process.on(signal, () => {
			forwardSignal(signal);
		});
	}

	process.on('uncaughtException', (error) => {
		cleanupWorkspace();
		throw error;
	});

	process.on('exit', () => {
		if (childExited) {
			cleanupWorkspace();
		}
	});

	child.on('exit', (code, signal) => {
		childExited = true;
		cleanupWorkspace();

		if (signal) {
			process.exit(1);
			return;
		}

		process.exit(code ?? 1);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
