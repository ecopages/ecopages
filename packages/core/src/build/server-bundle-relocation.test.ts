import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cliPath = path.join(repoRoot, 'packages/ecopages/bin/cli.js');
const HOME_MARKER = 'Relocated home';
const corePackageJson = JSON.parse(readFileSync(path.join(repoRoot, 'packages/core/package.json'), 'utf8')) as {
	version: string;
};

let workDir: string | undefined;
let server: ChildProcess | undefined;

afterEach(async () => {
	if (server && server.exitCode === null && server.signalCode === null) {
		const exited = once(server, 'exit');
		server.kill();
		await exited;
	}
	server = undefined;
	if (workDir) rmSync(workDir, { recursive: true, force: true });
	workDir = undefined;
});

function findPackageDir(fromDir: string, name: string): string | undefined {
	for (let dir = fromDir; ; dir = path.dirname(dir)) {
		const candidate = path.join(dir, 'node_modules', name);
		if (existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate);
		if (path.dirname(dir) === dir) return undefined;
	}
}

function linkDirectory(linkPath: string, targetPath: string): void {
	mkdirSync(path.dirname(linkPath), { recursive: true });
	symlinkSync(path.relative(path.dirname(linkPath), targetPath), linkPath, 'dir');
}

/**
 * Installs `packages` (name to source folder) and their runtime dependencies
 * into `appDir` with pnpm's isolated layout.
 *
 * @remarks
 * Each package is copied into `node_modules/.pnpm/<name>/node_modules/<name>`
 * and sees its dependencies only as sibling symlinks, so Core's dependencies
 * are not reachable as bare specifiers from the app. This is the layout the
 * server output has to survive. Packages outside a `node_modules` folder copy
 * only their published `files`, like the published `@ecopages/*` packages.
 */
function installIsolated(appDir: string, packages: Record<string, string>): void {
	const storeDir = (name: string) => path.join(appDir, 'node_modules/.pnpm', name.replace('/', '+'), 'node_modules');
	const installed = new Set<string>();
	const install = (name: string, sourceDir: string): void => {
		if (installed.has(name)) return;
		installed.add(name);
		const packageJson = JSON.parse(readFileSync(path.join(sourceDir, 'package.json'), 'utf8')) as {
			files?: string[];
			dependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
		};
		const isWorkspacePackage = !sourceDir.split(path.sep).includes('node_modules');
		const entries = isWorkspacePackage && packageJson.files ? ['package.json', ...packageJson.files] : ['.'];
		for (const entry of entries) {
			cpSync(path.join(sourceDir, entry), path.join(storeDir(name), name, entry), {
				recursive: true,
				dereference: true,
				filter: (source) => !path.relative(sourceDir, source).split(path.sep).includes('node_modules'),
			});
		}
		for (const dependency of Object.keys({ ...packageJson.dependencies, ...packageJson.optionalDependencies })) {
			const dependencyDir = findPackageDir(sourceDir, dependency);
			if (!dependencyDir) continue;
			install(dependency, dependencyDir);
			linkDirectory(path.join(storeDir(name), dependency), path.join(storeDir(dependency), dependency));
		}
	};
	for (const [name, sourceDir] of Object.entries(packages)) {
		install(name, sourceDir);
		linkDirectory(path.join(appDir, 'node_modules', name), path.join(storeDir(name), name));
	}
}

/**
 * Writes `source-lib`, a TypeScript source package published with
 * `files: ['src']`, and `native-like`, a compiled package that loads a
 * per-platform file next to itself through `createRequire(import.meta.url)`,
 * as `sharp` loads its binding. Returns the source folder of `source-lib`.
 */
function writeLocationBoundPackages(fixturesDir: string): string {
	const sourceLibDir = path.join(fixturesDir, 'source-lib');
	const nativeLikeDir = path.join(fixturesDir, 'node_modules/native-like');
	mkdirSync(path.join(sourceLibDir, 'src'), { recursive: true });
	mkdirSync(nativeLikeDir, { recursive: true });
	writeFileSync(
		path.join(sourceLibDir, 'package.json'),
		JSON.stringify({
			name: 'source-lib',
			type: 'module',
			files: ['src'],
			exports: './src/index.ts',
			dependencies: { 'native-like': '1.0.0' },
		}),
	);
	writeFileSync(
		path.join(sourceLibDir, 'src/index.ts'),
		"import { loadBinding } from 'native-like';\n\nexport const binding: { native: boolean } = loadBinding();\n",
	);
	writeFileSync(
		path.join(nativeLikeDir, 'package.json'),
		JSON.stringify({ name: 'native-like', version: '1.0.0', type: 'module', exports: './index.js' }),
	);
	writeFileSync(
		path.join(nativeLikeDir, 'index.js'),
		"import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\nexport const loadBinding = () => require(`./binding-${process.platform}.cjs`);\n",
	);
	writeFileSync(path.join(nativeLikeDir, `binding-${process.platform}.cjs`), 'module.exports = { native: true };\n');
	return sourceLibDir;
}

function writeApp(appDir: string): void {
	mkdirSync(path.join(appDir, 'src/pages'), { recursive: true });
	mkdirSync(path.join(appDir, 'src/includes'), { recursive: true });
	writeFileSync(
		path.join(appDir, 'package.json'),
		JSON.stringify({
			name: 'relocated-app',
			private: true,
			type: 'module',
			dependencies: { '@ecopages/core': '*', 'source-lib': '*' },
		}),
	);
	writeFileSync(
		path.join(appDir, 'eco.config.ts'),
		"import { defineConfig } from '@ecopages/core/config';\n\nexport default defineConfig({ rootDir: import.meta.dirname });\n",
	);
	writeFileSync(
		path.join(appDir, 'app.ts'),
		[
			"import { readFileSync } from 'node:fs';",
			"import { createApp } from '@ecopages/core/create-app';",
			"import { getCorePackageVersion } from './node_modules/@ecopages/core/src/build/cache/cache-keys.ts';",
			"import { binding } from 'source-lib';",
			'',
			'const app = await createApp();',
			"app.get('/api/ping', async ({ response }) => response.json({ ok: true }));",
			"app.get('/api/core-version', async ({ response }) => response.json(getCorePackageVersion()));",
			"app.get('/api/binding', async ({ response }) => response.json(binding));",
			"app.get('/api/source-name', async ({ response }) => response.json(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name));",
			'await app.start();',
			'',
		].join('\n'),
	);
	writeFileSync(
		path.join(appDir, 'src/includes/html.html'),
		'<html lang="en"><head><meta charset="utf-8" /><title>Relocated</title></head><body><!-- eco:children --></body></html>\n',
	);
	writeFileSync(path.join(appDir, 'src/pages/index.html'), `<main><h1>${HOME_MARKER}</h1></main>\n`);
}

function readServerOutput(serverDir: string): string {
	return readdirSync(serverDir, { recursive: true, encoding: 'utf8' })
		.filter((file) => /\.[cm]?js$/u.test(file))
		.map((file) => readFileSync(path.join(serverDir, file), 'utf8'))
		.join('\n');
}

/**
 * @remarks
 * The server listens on port 0, so the OS picks a free port and the startup
 * log reports it; no port is reserved ahead of time.
 */
async function waitForServerUrl(child: ChildProcess, output: () => string): Promise<string> {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		const url = /running at (http:\/\/\S+)/u.exec(output())?.[1];
		if (url) return url;
		if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}:\n${output()}`);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Server did not start:\n${output()}`);
}

/**
 * @remarks
 * Builds a real app with `node`, copies the deploy layout to a directory
 * with a different root, deletes the build tree, then serves it with `node`.
 * Any absolute path to the build machine in the server output fails here, and
 * so do a bundled location-bound package (a dependency of a source package
 * that loads a file next to itself) and an `import.meta.url` read in the
 * bundled entry, by the app or by Core reading its own `package.json`, that
 * resolves from `dist/.server/` instead of the source file.
 * `VITEST` is cleared for the build because the `ecopages` CLI does not run
 * its command while it is set.
 */
test(
	'a server build keeps serving after dist and node_modules move to another root',
	{ timeout: 120_000 },
	async () => {
		workDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-relocation-')));
		const buildDir = path.join(workDir, 'build/app');
		const deployDir = path.join(workDir, 'srv/deploy/app');
		writeApp(buildDir);
		installIsolated(buildDir, {
			'@ecopages/core': path.join(repoRoot, 'packages/core'),
			'source-lib': writeLocationBoundPackages(path.join(buildDir, '../fixtures')),
		});

		execFileSync(process.execPath, [cliPath, 'build', '--runtime', 'node'], {
			cwd: buildDir,
			env: { ...process.env, VITEST: '', NODE_ENV: 'production' },
			stdio: 'pipe',
			timeout: 90_000,
		});

		const serverOutput = readServerOutput(path.join(buildDir, 'dist/.server'));
		expect(serverOutput).not.toContain('file://');
		expect(serverOutput).not.toContain(buildDir);

		for (const entry of ['dist', 'src', 'node_modules', 'package.json']) {
			cpSync(path.join(buildDir, entry), path.join(deployDir, entry), {
				recursive: true,
				verbatimSymlinks: true,
			});
		}
		rmSync(path.join(workDir, 'build'), { recursive: true, force: true });

		let output = '';
		server = spawn(process.execPath, ['dist/.server/app.mjs'], {
			cwd: deployDir,
			env: {
				...process.env,
				NODE_ENV: 'production',
				ECOPAGES_HOSTNAME: '127.0.0.1',
				ECOPAGES_PORT: '0',
			},
			stdio: 'pipe',
		});
		server.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
		server.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

		const serverUrl = await waitForServerUrl(server, () => output);
		const response = await fetch(new URL('/', serverUrl), { signal: AbortSignal.timeout(15_000) });
		expect(response.status).toBe(200);
		expect(await response.text()).toContain(HOME_MARKER);
		const getJson = async (route: string) =>
			await (await fetch(new URL(route, serverUrl), { signal: AbortSignal.timeout(15_000) })).json();
		expect(await getJson('/api/binding')).toEqual({ native: true });
		expect(await getJson('/api/core-version')).toBe(corePackageJson.version);
		expect(await getJson('/api/source-name')).toBe('relocated-app');
	},
);
