/**
 * Docs e2e server launcher. Skips `pnpm build` when `apps/docs/dist` is newer
 * than `apps/docs/src`, then starts the preview server.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const docsSrc = path.join(repoRoot, 'apps', 'docs', 'src');
const docsDist = path.join(repoRoot, 'apps', 'docs', 'dist');
const docsEco = path.join(repoRoot, 'apps', 'docs', '.eco');
const port = process.env.ECOPAGES_PORT || '4009';

/** Workspace packages whose changes must invalidate a cached docs dist build. */
const DOCS_BUILD_INPUT_ROOTS = [
	docsSrc,
	path.join(repoRoot, 'packages', 'core', 'src'),
	path.join(repoRoot, 'packages', 'processors', 'content-processor', 'src'),
	path.join(repoRoot, 'packages', 'integrations', 'react', 'src'),
	path.join(repoRoot, 'packages', 'integrations', 'ecopages-jsx', 'src'),
	path.join(repoRoot, 'packages', 'react-router', 'src'),
	path.join(repoRoot, 'packages', 'browser-router', 'src'),
];

const EXCLUDED_NAMES = new Set(['node_modules', 'dist', '.eco', '.eco-config']);

function getNewestMtime(dir) {
	if (!existsSync(dir)) {
		return 0;
	}

	let newest = 0;
	const stack = [dir];

	while (stack.length > 0) {
		const currentDir = stack.pop();

		let entries;
		try {
			entries = readdirSync(currentDir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (EXCLUDED_NAMES.has(entry.name)) {
				continue;
			}

			const fullPath = path.join(currentDir, entry.name);

			let stat;
			try {
				stat = statSync(fullPath);
			} catch {
				continue;
			}

			if (stat.mtimeMs > newest) {
				newest = stat.mtimeMs;
			}

			if (stat.isDirectory()) {
				stack.push(fullPath);
			}
		}
	}

	return newest;
}

function isDistFresh() {
	if (!existsSync(docsDist)) {
		return false;
	}

	/**
	 * Interrupted builds can leave public assets without rendered HTML. Treat those
	 * as stale so preview never serves a hollow dist that 404s every docs route.
	 */
	if (!existsSync(path.join(docsDist, 'index.html'))) {
		return false;
	}

	const distMtime = getNewestMtime(docsDist);
	const inputMtime = Math.max(...DOCS_BUILD_INPUT_ROOTS.map((root) => getNewestMtime(root)));

	return distMtime > inputMtime;
}

function runCommand(command) {
	const child = spawn(command, { cwd: repoRoot, env: process.env, stdio: 'inherit', shell: true });

	child.on('exit', (code, signal) => {
		if (signal) {
			process.exit(1);
			return;
		}

		process.exit(code ?? 1);
	});
}

const previewCommand = `NODE_ENV=production ECOPAGES_PORT=${port} ECOPAGES_PREVIEW_SERVE_ONLY=true pnpm --filter @ecopages/docs run preview`;

if (isDistFresh()) {
	console.log('[docs-e2e] dist is fresh — skipping build');
	runCommand(previewCommand);
} else {
	if (existsSync(docsDist)) {
		console.log('[docs-e2e] dist is stale — rebuilding');
		rmSync(docsDist, { recursive: true, force: true });
	} else {
		console.log('[docs-e2e] no dist — building');
	}

	if (existsSync(docsEco)) {
		rmSync(docsEco, { recursive: true, force: true });
	}

	runCommand(`NODE_ENV=production pnpm --filter @ecopages/docs run build && ${previewCommand}`);
}
