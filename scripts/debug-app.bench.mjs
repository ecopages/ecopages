#!/usr/bin/env node
/**
 * Benchmark / debug an external Ecopages app against local package dist outputs.
 *
 * @remarks
 * Use this from the ecopages repo root when investigating startup latency,
 * SSR time, and per-module `dev-client-transform` cost in a consumer app.
 * Results go under `.audit/` (gitignored). Prefer args over hardcoding app paths.
 *
 * @example
 * ```bash
 * pnpm build:npm
 * node scripts/debug-app.bench.mjs \
 *   --app ../techn.es/apps/agora \
 *   --paths /login,/dashboard \
 *   --port 3012 \
 *   --link-local
 * ```
 *
 * Common flags:
 * - `--app <dir>` — required absolute or repo-relative path to the app
 * - `--paths <a,b>` — routes to fetch after listen (default: `/`)
 * - `--port <n>` — listen port (default: `3012`)
 * - `--link-local` — temporarily point matching deps at local dist + `pnpm update`
 * - `--workspace <dir>` — monorepo root with `pnpm-workspace.yaml` for overrides
 * - `--out <file>` — JSON report path (default: `.audit/debug-app-bench.json`)
 * - `--skip-cases <a,b>` — omit `cold-at-listen`, `after-listen`, and/or `warm-restart`
 * - `--measure-modules` — fetch rewritten `/assets/__eco_dev__/` + vendor URLs from HTML
 * - `--help` — print usage
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

/** Local package name → dist directory under this repo. */
const LOCAL_PACKAGE_DIST = {
	ecopages: path.join(repoRoot, 'packages', 'ecopages', 'dist'),
	'@ecopages/browser-router': path.join(repoRoot, 'packages', 'browser-router', 'dist'),
	'@ecopages/core': path.join(repoRoot, 'packages', 'core', 'dist'),
	'@ecopages/file-system': path.join(repoRoot, 'packages', 'file-system', 'dist'),
	'@ecopages/image-processor': path.join(repoRoot, 'packages', 'processors', 'image-processor', 'dist'),
	'@ecopages/mdx': path.join(repoRoot, 'packages', 'integrations', 'mdx', 'dist'),
	'@ecopages/postcss-processor': path.join(repoRoot, 'packages', 'processors', 'postcss-processor', 'dist'),
	'@ecopages/react': path.join(repoRoot, 'packages', 'integrations', 'react', 'dist'),
	'@ecopages/react-router': path.join(repoRoot, 'packages', 'react-router', 'dist'),
	'@ecopages/ecopages-jsx': path.join(repoRoot, 'packages', 'integrations', 'ecopages-jsx', 'dist'),
	'@ecopages/kitajs': path.join(repoRoot, 'packages', 'integrations', 'kitajs', 'dist'),
	'@ecopages/lit': path.join(repoRoot, 'packages', 'integrations', 'lit', 'dist'),
};

const ALL_CASES = ['cold-at-listen', 'after-listen', 'warm-restart'];

function printHelp() {
	console.log(`Usage:
  node scripts/debug-app.bench.mjs --app <dir> [options]

Options:
  --app <dir>              Consumer app directory (required)
  --paths <a,b>            Routes to fetch (default: /)
  --port <n>               Dev server port (default: 3012)
  --hostname <host>        Bind host (default: 0.0.0.0)
  --link-local             Rewrite matching deps to local dist and pnpm update
  --workspace <dir>        Monorepo root containing pnpm-workspace.yaml
  --out <file>             JSON report path (default: .audit/debug-app-bench.json)
  --skip-cases <a,b>       Skip one or more of: ${ALL_CASES.join(', ')}
  --measure-modules        Size/time rewritten module + vendor URLs from HTML
  --help                   Show this help

Interpretation tips:
  - first-request-ssr high → SSR / middleware / data, not client transform
  - dev-client-transform high + large __eco_dev__ page module → still bundling too much
  - many vendor requests first nav, cache hits later → expected Vite-like model
`);
}

function parseCli(argv) {
	const { values } = parseArgs({
		args: argv,
		options: {
			app: { type: 'string' },
			paths: { type: 'string', default: '/' },
			port: { type: 'string', default: '3012' },
			hostname: { type: 'string', default: '0.0.0.0' },
			'link-local': { type: 'boolean', default: false },
			workspace: { type: 'string' },
			out: { type: 'string' },
			'skip-cases': { type: 'string', default: '' },
			'measure-modules': { type: 'boolean', default: false },
			help: { type: 'boolean', default: false },
		},
		strict: true,
		allowPositionals: false,
	});

	if (values.help || !values.app) {
		printHelp();
		process.exit(values.help ? 0 : 1);
	}

	const appDir = path.resolve(repoRoot, values.app);
	const skipCases = new Set(
		values['skip-cases']
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean),
	);
	const cases = ALL_CASES.filter((name) => !skipCases.has(name));
	const outPath = path.resolve(repoRoot, values.out ?? path.join('.audit', 'debug-app-bench.json'));

	return {
		appDir,
		paths: values.paths
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean),
		port: Number(values.port),
		hostname: values.hostname,
		linkLocal: values['link-local'],
		workspaceDir: values.workspace ? path.resolve(repoRoot, values.workspace) : undefined,
		outPath,
		cases,
		measureModules: values['measure-modules'],
	};
}

function toFileSpec(absolutePath) {
	return `file:${absolutePath}`;
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}

function run(command, args, cwd, env = process.env) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			const text = String(chunk);
			stdout += text;
			process.stdout.write(text);
		});
		child.stderr.on('data', (chunk) => {
			const text = String(chunk);
			stderr += text;
			process.stderr.write(text);
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
			}
		});
	});
}

function parseTraceLines(output) {
	const phases = {};
	for (const line of output.split('\n')) {
		const phaseMatch = line.match(/phase=([^\s]+)(?:\s+durationMs=(\d+))?/);
		if (phaseMatch) {
			phases[phaseMatch[1]] = {
				durationMs: phaseMatch[2] ? Number(phaseMatch[2]) : undefined,
				line,
			};
		}
	}
	return phases;
}

function collectMatchingLocalPackages(packageJson) {
	const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
	const matched = {};
	for (const section of sections) {
		for (const name of Object.keys(packageJson[section] ?? {})) {
			if (LOCAL_PACKAGE_DIST[name]) {
				matched[name] = LOCAL_PACKAGE_DIST[name];
			}
		}
	}
	return matched;
}

function clearAppCaches(appDir) {
	fs.rmSync(path.join(appDir, '.eco'), { recursive: true, force: true });
	fs.rmSync(path.join(appDir, 'dist', '.dev-transform'), { recursive: true, force: true });
}

function startDevServer(options) {
	const { appDir, port, hostname, clearArtifacts } = options;
	return new Promise((resolve, reject) => {
		if (clearArtifacts) {
			clearAppCaches(appDir);
		}

		const child = spawn('pnpm', ['exec', 'ecopages', 'dev', '-r', '-p', String(port), '-n', hostname], {
			cwd: appDir,
			env: {
				...process.env,
				ECOPAGES_STARTUP_TRACE: 'true',
				ECOPAGES_LOGGER_DEBUG: 'false',
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let output = '';
		const append = (chunk) => {
			const text = String(chunk);
			output += text;
			process.stdout.write(text);
		};
		child.stdout.on('data', append);
		child.stderr.on('data', append);

		const deadline = Date.now() + 180_000;
		const interval = setInterval(() => {
			if (output.includes('running at') || output.includes(`localhost:${port}`)) {
				clearInterval(interval);
				resolve({
					child,
					output: () => output,
					waitFor: async (pattern, timeoutMs = 120_000) => {
						const start = Date.now();
						while (Date.now() - start < timeoutMs) {
							if (pattern.test(output)) {
								return output;
							}
							await new Promise((resolveWait) => setTimeout(resolveWait, 250));
						}
						throw new Error(`Timed out waiting for ${pattern}`);
					},
				});
				return;
			}

			if (Date.now() > deadline) {
				clearInterval(interval);
				child.kill('SIGTERM');
				reject(new Error('Dev server failed to start within 180s'));
			}
		}, 250);

		child.on('exit', (code) => {
			if (code !== null && code !== 0) {
				clearInterval(interval);
				reject(new Error(`Dev server exited early with code ${code}\n${output}`));
			}
		});
	});
}

async function fetchRoute(baseUrl, routePath) {
	const url = new URL(routePath, baseUrl).href;
	const start = Date.now();
	const response = await fetch(url, { redirect: 'manual' });
	const body = await response.text();
	const elapsed = Date.now() - start;
	return { url, status: response.status, elapsed, body };
}

async function measureModuleUrls(baseUrl, html) {
	const urls = [...html.matchAll(/["'](\/assets\/(?:__eco_dev__|vendors)\/[^"']+)["']/g)].map((match) => match[1]);
	const uniqueUrls = [...new Set(urls)];
	const modules = [];

	for (const modulePath of uniqueUrls) {
		const start = Date.now();
		const response = await fetch(new URL(modulePath, baseUrl).href, { redirect: 'manual' });
		const body = await response.text();
		modules.push({
			path: modulePath,
			status: response.status,
			bytes: Buffer.byteLength(body, 'utf8'),
			elapsedMs: Date.now() - start,
			cacheControl: response.headers.get('cache-control'),
		});
	}

	return modules;
}

async function stopServer(session) {
	if (!session?.child || session.child.killed) {
		return;
	}

	const child = session.child;
	child.kill('SIGTERM');

	await new Promise((resolve) => {
		const timer = setTimeout(() => {
			try {
				child.kill('SIGKILL');
			} catch {
				// already stopped
			}
			resolve();
		}, 8000);

		child.once('exit', () => {
			clearTimeout(timer);
			resolve();
		});
	});

	await new Promise((resolve) => setTimeout(resolve, 1500));
}

async function runCase(options) {
	const { name, clearArtifacts, waitForListenPhase, config } = options;
	const baseUrl = `http://127.0.0.1:${config.port}`;
	console.log(`\n=== Case: ${name} ===`);

	const session = await startDevServer({
		appDir: config.appDir,
		port: config.port,
		hostname: config.hostname,
		clearArtifacts,
	});

	if (waitForListenPhase) {
		await session.waitFor(/phase=server-listen\s+durationMs=/);
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	const routes = [];
	for (const routePath of config.paths) {
		const sinceListen = Date.now();
		const result = await fetchRoute(baseUrl, routePath);
		const entry = {
			path: routePath,
			httpStatus: result.status,
			curlMs: result.elapsed,
			msSinceCaseStart: Date.now() - sinceListen,
		};

		if (config.measureModules) {
			entry.modules = await measureModuleUrls(baseUrl, result.body);
		}

		routes.push(entry);
	}

	const phases = parseTraceLines(session.output());
	await stopServer(session);

	return {
		name,
		routes,
		phases,
		devClientTransformMs: phases['dev-client-transform']?.durationMs,
		firstRequestSsrMs: phases['first-request-ssr']?.durationMs,
		firstPageBrowserGraphMs: phases['first-page-browser-graph']?.durationMs,
	};
}

async function withLinkedLocalPackages(config, matchedPackages, runBody) {
	const packageJsonPath = path.join(config.appDir, 'package.json');
	const workspaceYamlPath = config.workspaceDir ? path.join(config.workspaceDir, 'pnpm-workspace.yaml') : null;
	const packageJsonBackup = fs.readFileSync(packageJsonPath, 'utf8');
	const workspaceBackup =
		workspaceYamlPath && fs.existsSync(workspaceYamlPath) ? fs.readFileSync(workspaceYamlPath, 'utf8') : null;

	try {
		const packageJson = readJson(packageJsonPath);
		for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
			for (const [name, targetPath] of Object.entries(matchedPackages)) {
				if (packageJson[section]?.[name]) {
					packageJson[section][name] = toFileSpec(targetPath);
				}
			}
		}
		writeJson(packageJsonPath, packageJson);

		if (workspaceBackup && workspaceYamlPath) {
			const fileOverrides = Object.fromEntries(
				Object.entries(matchedPackages).map(([name, targetPath]) => [name, toFileSpec(targetPath)]),
			);
			const lines = workspaceBackup.split('\n');
			const overridesIndex = lines.findIndex((line) => line.trim() === 'overrides:');
			if (overridesIndex === -1) {
				throw new Error(`Could not find overrides block in ${workspaceYamlPath}`);
			}

			let endIndex = overridesIndex + 1;
			while (endIndex < lines.length && /^\s{4}\S/.test(lines[endIndex] ?? '')) {
				endIndex += 1;
			}

			const overrideLines = Object.entries(fileOverrides).map(
				([name, spec]) => `    ${JSON.stringify(name)}: ${JSON.stringify(spec)}`,
			);
			const nextLines = [...lines.slice(0, endIndex), ...overrideLines, ...lines.slice(endIndex)];
			fs.writeFileSync(workspaceYamlPath, `${nextLines.join('\n')}\n`, 'utf8');
		}

		console.log('Updating app deps to local ecopages dist packages...');
		await run('pnpm', ['update', ...Object.keys(matchedPackages)], config.appDir);
		return await runBody();
	} finally {
		fs.writeFileSync(packageJsonPath, packageJsonBackup, 'utf8');
		if (workspaceBackup !== null && workspaceYamlPath) {
			fs.writeFileSync(workspaceYamlPath, workspaceBackup, 'utf8');
		}
	}
}

async function main() {
	const config = parseCli(process.argv.slice(2));
	const packageJsonPath = path.join(config.appDir, 'package.json');

	if (!fs.existsSync(packageJsonPath)) {
		throw new Error(`App package.json not found at ${packageJsonPath}`);
	}

	const packageJson = readJson(packageJsonPath);
	const matchedPackages = collectMatchingLocalPackages(packageJson);

	for (const targetPath of Object.values(matchedPackages)) {
		if (!fs.existsSync(targetPath)) {
			throw new Error(`Missing local build output: ${targetPath}. Run pnpm build:npm first.`);
		}
	}

	const execute = async () => {
		const results = {
			appDir: config.appDir,
			paths: config.paths,
			port: config.port,
			linkedPackages: Object.keys(matchedPackages),
			cases: {},
		};

		for (const caseName of config.cases) {
			results.cases[caseName] = await runCase({
				name: caseName,
				clearArtifacts: caseName !== 'warm-restart',
				waitForListenPhase: caseName !== 'cold-at-listen',
				config,
			});
		}

		fs.mkdirSync(path.dirname(config.outPath), { recursive: true });
		fs.writeFileSync(config.outPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

		console.log('\n=== Summary ===');
		console.log(JSON.stringify(results, null, 2));
		console.log(`\nWrote ${config.outPath}`);
		return results;
	};

	if (config.linkLocal) {
		if (Object.keys(matchedPackages).length === 0) {
			throw new Error('No matching @ecopages/* / ecopages deps found to --link-local');
		}
		await withLinkedLocalPackages(config, matchedPackages, execute);
		return;
	}

	await execute();
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
