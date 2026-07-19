/**
 * Benchmark HMR cold client-graph warmup against the agora app using local dist packages.
 *
 * Usage (from ecopages repo root):
 *   node scripts/agora-hmr-warmup-bench.mjs
 *
 * Requires agora at ../techn.es/apps/agora and docker postgres for /login SSR.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const agoraDir = path.resolve(repoRoot, '..', 'techn.es', 'apps', 'agora');
const agoraPackageJsonPath = path.join(agoraDir, 'package.json');
const workspaceYamlPath = path.resolve(agoraDir, '..', '..', 'pnpm-workspace.yaml');
const loginUrl = `http://localhost:${process.env.AGORA_BENCH_PORT ?? '3012'}/login`;
const port = Number(process.env.AGORA_BENCH_PORT ?? '3012');

const localPackages = {
	ecopages: path.join(repoRoot, 'packages', 'ecopages', 'dist'),
	'@ecopages/browser-router': path.join(repoRoot, 'packages', 'browser-router', 'dist'),
	'@ecopages/core': path.join(repoRoot, 'packages', 'core', 'dist'),
	'@ecopages/file-system': path.join(repoRoot, 'packages', 'file-system', 'dist'),
	'@ecopages/image-processor': path.join(repoRoot, 'packages', 'processors', 'image-processor', 'dist'),
	'@ecopages/mdx': path.join(repoRoot, 'packages', 'integrations', 'mdx', 'dist'),
	'@ecopages/postcss-processor': path.join(repoRoot, 'packages', 'processors', 'postcss-processor', 'dist'),
	'@ecopages/react': path.join(repoRoot, 'packages', 'integrations', 'react', 'dist'),
	'@ecopages/react-router': path.join(repoRoot, 'packages', 'react-router', 'dist'),
};

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

function startDevServer(clearArtifacts) {
	return new Promise((resolve, reject) => {
		if (clearArtifacts) {
			fs.rmSync(path.join(agoraDir, '.eco', 'assets', '_hmr'), { recursive: true, force: true });
			fs.rmSync(path.join(agoraDir, 'node_modules', '.cache', 'ecopages'), { recursive: true, force: true });
		}

		const child = spawn('pnpm', ['exec', 'ecopages', 'dev', '-r', '-p', String(port), '-n', '0.0.0.0'], {
			cwd: agoraDir,
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
							await new Promise((r) => setTimeout(r, 250));
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

async function curlLogin() {
	const start = Date.now();
	const response = await fetch(loginUrl, { redirect: 'manual' });
	const elapsed = Date.now() - start;
	return { status: response.status, elapsed };
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

	await new Promise((r) => setTimeout(r, 1500));
}

async function main() {
	if (!fs.existsSync(agoraPackageJsonPath)) {
		throw new Error(`Agora not found at ${agoraDir}`);
	}

	for (const targetPath of Object.values(localPackages)) {
		if (!fs.existsSync(targetPath)) {
			throw new Error(`Missing local build output: ${targetPath}. Run pnpm build:npm first.`);
		}
	}

	const packageJsonBackup = fs.readFileSync(agoraPackageJsonPath, 'utf8');
	const workspaceBackup = fs.existsSync(workspaceYamlPath) ? fs.readFileSync(workspaceYamlPath, 'utf8') : null;

	const packageJson = readJson(agoraPackageJsonPath);
	for (const [name, targetPath] of Object.entries(localPackages)) {
		if (packageJson.devDependencies?.[name]) {
			packageJson.devDependencies[name] = toFileSpec(targetPath);
		}
	}
	writeJson(agoraPackageJsonPath, packageJson);

	if (workspaceBackup) {
		const fileOverrides = Object.fromEntries(
			Object.entries(localPackages).map(([name, targetPath]) => [name, toFileSpec(targetPath)]),
		);
		const lines = workspaceBackup.split('\n');
		const overridesIndex = lines.findIndex((line) => line.trim() === 'overrides:');
		if (overridesIndex === -1) {
			throw new Error('Could not find overrides block in pnpm-workspace.yaml');
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

	console.log('Installing agora with local ecopages dist packages...');
	await run('pnpm', ['update', ...Object.keys(localPackages)], agoraDir);

	const results = {};

	try {
		console.log('\n=== Case A: immediate /login at listen ===');
		let session = await startDevServer(true);
		const caseAStart = Date.now();
		const caseA = await curlLogin();
		const caseAOutput = session.output();
		results.caseA = {
			httpStatus: caseA.status,
			curlMs: caseA.elapsed,
			msSinceListen: Date.now() - caseAStart,
			phases: parseTraceLines(caseAOutput),
		};
		await stopServer(session);

		console.log('\n=== Case B: /login after dev-cold-client-graph ===');
		session = await startDevServer(true);
		await session.waitFor(/phase=dev-cold-client-graph\s+durationMs=/);
		await new Promise((r) => setTimeout(r, 500));
		const caseB = await curlLogin();
		const caseBOutput = session.output();
		results.caseB = {
			httpStatus: caseB.status,
			curlMs: caseB.elapsed,
			phases: parseTraceLines(caseBOutput),
			firstPageBrowserGraphMs: parseTraceLines(caseBOutput)['first-page-browser-graph']?.durationMs,
		};
		await stopServer(session);

		console.log('\n=== Case C: restart with disk cache ===');
		session = await startDevServer(false);
		await session.waitFor(/phase=dev-cold-client-graph\s+durationMs=/);
		const caseC = await curlLogin();
		const caseCOutput = session.output();
		results.caseC = {
			httpStatus: caseC.status,
			curlMs: caseC.elapsed,
			phases: parseTraceLines(caseCOutput),
			devColdClientGraphMs: parseTraceLines(caseCOutput)['dev-cold-client-graph']?.durationMs,
			firstPageBrowserGraphMs: parseTraceLines(caseCOutput)['first-page-browser-graph']?.durationMs,
		};
		await stopServer(session);

		const benchPath = path.join(repoRoot, '.audit', 'agora-hmr-warmup-bench.json');
		fs.mkdirSync(path.dirname(benchPath), { recursive: true });
		fs.writeFileSync(benchPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

		console.log('\n=== Summary ===');
		console.log(JSON.stringify(results, null, 2));
		console.log(`\nWrote ${benchPath}`);
	} finally {
		fs.writeFileSync(agoraPackageJsonPath, packageJsonBackup, 'utf8');
		if (workspaceBackup !== null) {
			fs.writeFileSync(workspaceYamlPath, workspaceBackup, 'utf8');
		}
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
