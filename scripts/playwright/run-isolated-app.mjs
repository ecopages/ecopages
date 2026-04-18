import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const tempRootDir = path.join(repoRoot, '.e2e-tmp');
const keepWorkspace = process.env.ECOPAGES_KEEP_E2E_TMP === 'true';
const excludedTopLevelEntries = new Set(['.eco', '.e2e', 'dist', 'node_modules']);

function parseArgs(argv) {
	const options = {
		host: 'ecopages',
		mode: 'dev',
		port: '',
		runtime: 'bun',
		sourceDir: '',
		workspace: '',
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const nextValue = argv[index + 1];

		if (arg === '--workspace' && nextValue) {
			options.workspace = nextValue;
			index += 1;
			continue;
		}

		if (arg === '--sourceDir' && nextValue) {
			options.sourceDir = nextValue;
			index += 1;
			continue;
		}

		if (arg === '--host' && nextValue) {
			options.host = nextValue;
			index += 1;
			continue;
		}

		if (arg === '--runtime' && nextValue) {
			options.runtime = nextValue;
			index += 1;
			continue;
		}

		if (arg === '--mode' && nextValue) {
			options.mode = nextValue;
			index += 1;
			continue;
		}

		if (arg === '--port' && nextValue) {
			options.port = nextValue;
			index += 1;
			continue;
		}
	}

	if (!options.sourceDir || !options.workspace || !options.port) {
		throw new Error('Missing required isolated Playwright app launcher arguments.');
	}

	if (!['ecopages', 'vite'].includes(options.host)) {
		throw new Error(`Unsupported isolated app host: ${options.host}`);
	}

	if (!['dev', 'preview'].includes(options.mode)) {
		throw new Error(`Unsupported isolated app mode: ${options.mode}`);
	}

	if (!['bun', 'node'].includes(options.runtime)) {
		throw new Error(`Unsupported isolated app runtime: ${options.runtime}`);
	}

	if (options.host === 'vite' && options.mode !== 'dev') {
		throw new Error('Vite isolated Playwright servers only support dev mode.');
	}

	const port = Number(options.port);
	if (!Number.isInteger(port) || port <= 0) {
		throw new Error(`Invalid isolated app port: ${options.port}`);
	}

	return {
		...options,
		port,
	};
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
		if (!relativePath) {
			return true;
		}

		const [topLevelEntry] = relativePath.split(path.sep);
		return !excludedTopLevelEntries.has(topLevelEntry);
	};
}

function prepareWorkspace(sourceDir, workspaceDir) {
	rmSync(workspaceDir, { recursive: true, force: true });
	mkdirSync(path.dirname(workspaceDir), { recursive: true });
	cpSync(sourceDir, workspaceDir, {
		recursive: true,
		filter: buildCopyFilter(sourceDir),
	});

	const sourceNodeModulesDir = path.join(sourceDir, 'node_modules');
	const targetNodeModulesDir = path.join(workspaceDir, 'node_modules');
	if (existsSync(sourceNodeModulesDir)) {
		if (existsSync(targetNodeModulesDir)) {
			rmSync(targetNodeModulesDir, { recursive: true, force: true });
		}
		symlinkSync(sourceNodeModulesDir, targetNodeModulesDir, 'dir');
	}
}

function buildCommand(options) {
	if (options.host === 'vite') {
		const viteRunner = options.runtime === 'bun' ? 'bunx vite' : 'pnpm exec vite';
		return `${viteRunner} dev --port ${options.port} --logLevel silent`;
	}

	if (options.mode === 'preview') {
		return `pnpm exec ecopages build --runtime ${options.runtime} && pnpm exec ecopages preview --runtime ${options.runtime} --port ${options.port}`;
	}

	return `pnpm exec ecopages dev --runtime ${options.runtime} --port ${options.port}`;
}

function buildEnv(options) {
	return {
		...process.env,
		...(options.host === 'vite' ? { ECOPAGES_KITCHEN_SINK_HOST: 'vite' } : {}),
		NODE_ENV: options.mode === 'preview' ? 'production' : 'development',
	};
}

const options = parseArgs(process.argv.slice(2));
const sourceDir = getAbsoluteSourceDir(options.sourceDir);
const workspaceDir = getWorkspaceDir(options.workspace);
prepareWorkspace(sourceDir, workspaceDir);

let cleanedUp = false;
let childExited = false;

function cleanupWorkspace() {
	if (cleanedUp || keepWorkspace) {
		return;
	}

	cleanedUp = true;
	rmSync(workspaceDir, { recursive: true, force: true });
}

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
