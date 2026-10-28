import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { findPublishablePackageDirs, readJsonFile, writeJsonFile } from './package-utils.ts';

type PackageJson = {
	name: string;
	[key: string]: unknown;
};

type TemplateManifest = {
	templates: Array<{ id: string; source: string; packageDirectory: string }>;
};

const repoRoot = path.resolve(import.meta.dirname, '..');
const defaultTemplateIds = ['html', 'jsx', 'react', 'lit-jsx'];
const dependencyBlocks = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const previewStopTimeoutMs = 10_000;
const previewReadyTimeoutMs = 120_000;

let failures = 0;

function report(status: 'PASS' | 'FAIL', label: string, detail?: string): void {
	console.log(`${status} ${label}${detail ? `: ${detail}` : ''}`);
	if (status === 'FAIL') failures += 1;
}

/**
 * Runs one smoke step, prints its PASS or FAIL line and reports whether it passed.
 */
async function step(label: string, run: () => void | Promise<void>): Promise<boolean> {
	const startedAt = Date.now();
	try {
		await run();
		report('PASS', label, `${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
		return true;
	} catch (error) {
		report('FAIL', label, error instanceof Error ? error.message : String(error));
		return false;
	}
}

function run(command: string, args: string[], cwd: string): string {
	try {
		return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	} catch (error) {
		const { stdout, stderr } = error as { stdout?: string; stderr?: string };
		const tail = (stderr || stdout || String(error)).trimEnd().split('\n').slice(-25).join('\n');
		throw new Error(`${command} ${args.join(' ')} failed, last lines:\n${tail}`);
	}
}

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

/**
 * Packs every built publishable package the way `changeset publish` does, from inside `dist`.
 *
 * @returns Package name to absolute tarball path.
 */
function packPackages(tarballsDir: string): Map<string, string> {
	const tarballs = new Map<string, string>();
	for (const packageDir of findPublishablePackageDirs(path.join(repoRoot, 'packages')).sort()) {
		const distDir = path.join(packageDir, 'dist');
		const { name } = readJsonFile<PackageJson>(path.join(distDir, 'package.json'));
		const { filename } = JSON.parse(
			run('pnpm', ['pack', '--json', '--pack-destination', tarballsDir], distDir),
		) as {
			filename: string;
		};
		tarballs.set(name, path.resolve(tarballsDir, path.basename(filename)));
	}
	return tarballs;
}

/**
 * Copies a template into a standalone project that installs every Ecopages package from its tarball.
 *
 * @remarks
 * pnpm 11 ignores `overrides` in `package.json`, so they live in the project's `pnpm-workspace.yaml`.
 * Without them, pnpm resolves the sibling packages that the tarballs depend on from the registry and
 * the smoke test would run published code. `allowBuilds` keeps pnpm from failing on the esbuild and
 * sharp install scripts, and `minimumReleaseAge: 0` lets a template depend on a just-published release.
 */
function createProject(templateId: string, projectDir: string, tarballs: Map<string, string>): void {
	const manifest = readJsonFile<TemplateManifest>(path.join(repoRoot, 'packages/ecopages/templates.json'));
	const template = manifest.templates.find((entry) => entry.id === templateId);
	if (!template) throw new Error(`Unknown template "${templateId}".`);

	const sourceDir = path.join(repoRoot, 'templates', template.source, template.packageDirectory);
	cpSync(sourceDir, projectDir, {
		recursive: true,
		filter: (source) => !['node_modules', '.eco', 'dist'].includes(path.basename(source)),
	});

	const packageJsonPath = path.join(projectDir, 'package.json');
	const packageJson = readJsonFile<Record<string, unknown>>(packageJsonPath);
	for (const blockName of dependencyBlocks) {
		const block = packageJson[blockName] as Record<string, string> | undefined;
		for (const dependencyName of Object.keys(block ?? {})) {
			const tarball = tarballs.get(dependencyName);
			if (tarball) block![dependencyName] = `file:${tarball}`;
		}
	}
	writeJsonFile(packageJsonPath, packageJson);

	const overrides = [...tarballs].map(
		([name, tarball]) => `  ${JSON.stringify(name)}: ${JSON.stringify(`file:${tarball}`)}`,
	);
	writeFileSync(
		path.join(projectDir, 'pnpm-workspace.yaml'),
		[
			'overrides:',
			...overrides,
			'allowBuilds:',
			'  esbuild: true',
			'  sharp: true',
			'minimumReleaseAge: 0',
			'',
		].join('\n'),
	);
}

/**
 * Fails when any package built from this repository was installed from somewhere other than a tarball.
 *
 * @remarks
 * pnpm names each installed package folder `<name>@<version or file specifier>`, so a registry install
 * of a sibling package shows up as `@ecopages+core@0.3.0` instead of `@ecopages+core@file+...`.
 */
function assertInstalledFromTarballs(projectDir: string, tarballs: Map<string, string>): void {
	const installed = readdirSync(path.join(projectDir, 'node_modules/.pnpm'));
	const found = new Set<string>();
	const registry: string[] = [];
	for (const name of tarballs.keys()) {
		const prefix = `${name.replace('/', '+')}@`;
		for (const folder of installed.filter((entry) => entry.startsWith(prefix))) {
			found.add(name);
			if (!folder.startsWith(`${prefix}file+`)) registry.push(folder);
		}
	}
	if (registry.length > 0)
		throw new Error(`installed from the registry instead of a tarball: ${registry.join(', ')}`);
	for (const required of ['ecopages', '@ecopages/core']) {
		if (!found.has(required)) throw new Error(`${required} is not installed, so the check proves nothing`);
	}
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), timeoutMs);
		child.once('exit', () => {
			clearTimeout(timer);
			resolve(true);
		});
	});
}

/**
 * Signals the preview's whole process group, because `npx` and the CLI supervisor each start a child.
 *
 * @remarks
 * `process.kill` throws when the group has already exited, which is the normal case after a clean stop.
 */
function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
	try {
		process.kill(-child.pid!, signal);
	} catch {
		return;
	}
}

/**
 * Serves the project with `ecopages preview`, checks `/`, then checks the server stops on SIGTERM.
 */
async function smokePreview(projectDir: string): Promise<void> {
	const port = await findFreePort();
	const child = spawn('npx', ['--no-install', 'ecopages', 'preview', '--port', String(port)], {
		cwd: projectDir,
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	child.stdout!.on('data', (chunk) => (output += chunk));
	child.stderr!.on('data', (chunk) => (output += chunk));
	const killOnExit = () => killGroup(child, 'SIGKILL');
	process.once('exit', killOnExit);

	try {
		let response: Response | undefined;
		const deadline = Date.now() + previewReadyTimeoutMs;
		while (!response && Date.now() < deadline) {
			if (child.exitCode !== null)
				throw new Error(`preview exited with ${child.exitCode} before serving\n${output}`);
			response = await fetch(`http://localhost:${port}/`).catch(() => undefined);
			if (!response) await new Promise((resolve) => setTimeout(resolve, 500));
		}
		if (!response) throw new Error(`preview did not serve / within ${previewReadyTimeoutMs / 1000}s\n${output}`);
		const body = await response.text();
		if (response.status !== 200) throw new Error(`GET / returned ${response.status}`);
		if (!/<html[\s>]/i.test(body)) throw new Error('GET / did not return an HTML document');

		killGroup(child, 'SIGTERM');
		if (!(await waitForExit(child, previewStopTimeoutMs))) {
			throw new Error(`preview did not exit within ${previewStopTimeoutMs / 1000}s of SIGTERM`);
		}
	} finally {
		killOnExit();
		process.off('exit', killOnExit);
	}
}

async function smokeTemplate(templateId: string, workDir: string, tarballs: Map<string, string>): Promise<void> {
	const projectDir = path.join(workDir, 'projects', templateId);
	mkdirSync(projectDir, { recursive: true });
	const label = (name: string) => `${templateId}: ${name}`;

	const steps: Array<[string, () => void | Promise<void>]> = [
		['create project from tarballs', () => createProject(templateId, projectDir, tarballs)],
		['pnpm install', () => void run('pnpm', ['install', '--no-frozen-lockfile'], projectDir)],
		['every repository package comes from a tarball', () => assertInstalledFromTarballs(projectDir, tarballs)],
		['ecopages build', () => void run('npx', ['--no-install', 'ecopages', 'build'], projectDir)],
		[
			'dist/client/index.html exists',
			() => {
				if (!existsSync(path.join(projectDir, 'dist/client/index.html')))
					throw new Error('dist/client/index.html is missing');
			},
		],
	];
	if (templateId === 'html') steps.push(['ecopages preview serves / and stops', () => smokePreview(projectDir)]);

	for (const [name, action] of steps) {
		if (!(await step(label(name), action))) return;
	}
}

/**
 * Builds and packs every public package, installs the requested templates from those tarballs, builds
 * them and, for `html`, serves the build with `ecopages preview`. Exits non-zero when any step fails.
 *
 * @remarks
 * This is the slow, network-using release check, run locally or before a release. CI runs it only for
 * the `changeset-release/main` pull request and on manual dispatch; every pull request instead gets the
 * fast checks `check:ignored`, the import check inside `build-npm-packages.ts` and `smoke:templates`.
 * `--skip-build` reuses the existing `dist` folders.
 */
async function main(): Promise<void> {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: { 'skip-build': { type: 'boolean', default: false } },
	});
	const templateIds = positionals.length > 0 ? positionals : defaultTemplateIds;
	const workDir = mkdtempSync(path.join(os.tmpdir(), 'ecopages-smoke-packed-'));
	const startedAt = Date.now();
	const removeWorkDir = () => rmSync(workDir, { recursive: true, force: true });
	process.once('exit', removeWorkDir);
	for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => process.exit(130));

	try {
		if (!values['skip-build']) {
			await step('build npm packages', () => void run('node', ['scripts/build-npm-packages.ts'], repoRoot));
		}
		let tarballs = new Map<string, string>();
		const packed = await step('pnpm pack every package from dist', () => {
			tarballs = packPackages(path.join(workDir, 'tarballs'));
		});
		if (packed) {
			for (const templateId of templateIds) await smokeTemplate(templateId, workDir, tarballs);
		}
	} finally {
		removeWorkDir();
	}

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
	console.log(failures === 0 ? `All steps passed in ${seconds}s.` : `${failures} step(s) failed in ${seconds}s.`);
	process.exitCode = failures === 0 ? 0 : 1;
}

await main();
