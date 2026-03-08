import path from 'node:path';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

type PackageJson = {
	name?: string;
	type?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	pnpm?: {
		overrides?: Record<string, string>;
	};
	[key: string]: unknown;
};

const repoRoot = path.resolve(import.meta.dirname, '..');
const examplesSandboxRoot = path.join(repoRoot, '.examples');
const examplesRoot = path.join(repoRoot, 'examples');
const sourceFilePattern = /\.[cm]?[jt]sx?$/u;

const localPackageTargets: Record<string, string> = {
	ecopages: 'npm/ecopages',
	'@ecopages/browser-router': 'packages/browser-router/dist',
	'@ecopages/core': 'packages/core/dist',
	'@ecopages/file-system': 'packages/file-system/dist',
	'@ecopages/kitajs': 'packages/integrations/kitajs/dist',
	'@ecopages/lit': 'packages/integrations/lit/dist',
	'@ecopages/mdx': 'packages/integrations/mdx/dist',
	'@ecopages/react': 'packages/integrations/react/dist',
	'@ecopages/react-router': 'packages/react-router/dist',
	'@ecopages/image-processor': 'packages/processors/image-processor/dist',
	'@ecopages/postcss-processor': 'packages/processors/postcss-processor/dist',
};

function readJson<T>(filePath: string): T {
	return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function toFileSpec(targetPath: string): string {
	return pathToFileURL(targetPath).href;
}

/**
 * Finds Ecopages packages already declared by the example manifest.
 *
 * This is used as a guard so the script only runs for examples that are
 * actually built on top of local Ecopages packages.
 */
function collectDeclaredLocalPackages(packageJson: PackageJson): string[] {
	const declared = new Set<string>();

	for (const block of [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies]) {
		for (const packageName of Object.keys(block ?? {})) {
			if (packageName in localPackageTargets) {
				declared.add(packageName);
			}
		}
	}

	return Array.from(declared).sort();
}

/**
 * Finds Ecopages packages referenced in source files inside the example.
 */
function collectReferencedLocalPackagesFromFiles(exampleDir: string): string[] {
	const referenced = new Set<string>();
	const pendingDirs = [exampleDir];

	while (pendingDirs.length > 0) {
		const currentDir = pendingDirs.pop();
		if (!currentDir) {
			continue;
		}

		for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
			const entryPath = path.join(currentDir, entry.name);

			if (entry.isDirectory()) {
				if (shouldCopyExamplePath(entryPath)) {
					pendingDirs.push(entryPath);
				}
				continue;
			}

			if (!entry.isFile() || !sourceFilePattern.test(entry.name)) {
				continue;
			}

			const source = readFileSync(entryPath, 'utf-8');
			for (const packageName of Object.keys(localPackageTargets)) {
				if (source.includes(`'${packageName}'`) || source.includes(`"${packageName}"`)) {
					referenced.add(packageName);
				}
			}
		}
	}

	return Array.from(referenced).sort();
}

/**
 * Finds Ecopages packages referenced by package scripts.
 */
function collectReferencedLocalPackagesFromScripts(packageJson: PackageJson): string[] {
	const referenced = new Set<string>();

	for (const script of Object.values(packageJson.scripts ?? {})) {
		if (/\becopages\b/u.test(script)) {
			referenced.add('ecopages');
		}

		for (const packageName of Object.keys(localPackageTargets)) {
			if (packageName !== 'ecopages' && script.includes(packageName)) {
				referenced.add(packageName);
			}
		}
	}

	return Array.from(referenced).sort();
}

/**
 * Ensures Ecopages packages referenced by source files or scripts are declared
 * explicitly in the example manifest.
 */
function assertReferencedLocalPackagesAreDeclared(exampleDir: string, packageJson: PackageJson): void {
	const declared = new Set(collectDeclaredLocalPackages(packageJson));
	const referenced = new Set([
		...collectReferencedLocalPackagesFromFiles(exampleDir),
		...collectReferencedLocalPackagesFromScripts(packageJson),
	]);

	const missing = Array.from(referenced)
		.filter((packageName) => !declared.has(packageName))
		.sort();

	if (missing.length === 0) {
		return;
	}

	throw new Error(
		[
			`Missing Ecopages dependencies in ${path.relative(repoRoot, path.join(exampleDir, 'package.json'))}:`,
			...missing.map((packageName) => `- ${packageName}`),
			'',
			'Install them explicitly in dependencies, devDependencies, or peerDependencies before running this script.',
		].join('\n'),
	);
}

/**
 * Runs a command in a child process while forwarding stdio directly to the user.
 */
function runCommand(command: string, args: string[], cwd: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			stdio: 'inherit',
			shell: false,
		});

		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (signal) {
				resolve(1);
				return;
			}

			resolve(code ?? 0);
		});
	});
}

function runExamplePnpm(args: string[], cwd: string): Promise<number> {
	return runCommand('pnpm', ['--ignore-workspace', ...args], cwd);
}

function shouldCopyExamplePath(sourcePath: string): boolean {
	const name = path.basename(sourcePath);
	return name !== 'node_modules' && name !== 'dist' && name !== 'pnpm-lock.yaml';
}

/**
 * Keeps the sandbox layout short for examples while still supporting non-example
 * paths if the script is ever pointed elsewhere.
 */
function getSandboxRelativePath(exampleDir: string): string {
	if (exampleDir.startsWith(`${examplesRoot}${path.sep}`)) {
		return path.relative(examplesRoot, exampleDir);
	}

	return path.relative(repoRoot, exampleDir);
}

/**
 * Creates a fresh sandbox copy for the requested example under `.examples`.
 */
function createSandboxExampleDir(exampleDir: string): string {
	const sandboxExampleDir = path.join(examplesSandboxRoot, getSandboxRelativePath(exampleDir));
	rmSync(sandboxExampleDir, { recursive: true, force: true });
	mkdirSync(path.dirname(sandboxExampleDir), { recursive: true });
	cpSync(exampleDir, sandboxExampleDir, {
		recursive: true,
		filter: shouldCopyExamplePath,
	});
	return sandboxExampleDir;
}

/**
 * Builds the mutated package manifest that points the sandboxed example at the
 * locally built npm artifacts.
 */
function createSandboxPackageJson(packageJson: PackageJson, packageNames: string[]): PackageJson {
	const overrides = {
		...(packageJson.pnpm?.overrides ?? {}),
	};

	for (const packageName of packageNames) {
		overrides[packageName] = toFileSpec(path.join(repoRoot, localPackageTargets[packageName]));
	}

	return {
		...packageJson,
		type: packageJson.type ?? 'module',
		pnpm: {
			...(packageJson.pnpm ?? {}),
			overrides,
		},
	};
}

/**
 * Ensures local npm package outputs already exist before reusing them.
 */
function assertLocalPackageBuildOutputsExist(packageNames: string[]): void {
	const missingTargets = packageNames.filter((packageName) => {
		const targetDir = path.join(repoRoot, localPackageTargets[packageName]);
		return !existsSync(path.join(targetDir, 'package.json'));
	});

	if (missingTargets.length === 0) {
		return;
	}

	throw new Error(
		[
			'Missing local npm package build output for:',
			...missingTargets.map((packageName) => `- ${packageName}`),
			'',
			'Run the command again without --skip-build to rebuild local npm packages.',
		].join('\n'),
	);
}

type CliOptions = {
	skipBuild: boolean;
	exampleArg?: string;
	commandArgs: string[];
};

/**
 * Parses runner options before the example path.
 */

function parseCliOptions(): CliOptions {
	const parsed = parseArgs({
		allowPositionals: true,
		strict: false,
		tokens: true,
		options: {
			'skip-build': {
				type: 'boolean',
			},
		},
	});

	let skipBuild = false;
	let exampleArg: string | undefined;
	const commandArgs: string[] = [];

	for (const token of parsed.tokens ?? []) {
		if (!exampleArg) {
			if (token.kind === 'option' && token.name === 'skip-build') {
				skipBuild = true;
				continue;
			}

			if (token.kind === 'positional' && token.value === '--skip-build') {
				skipBuild = true;
				continue;
			}

			if (token.kind === 'positional') {
				exampleArg = token.value;
			}

			continue;
		}

		if (token.kind === 'positional') {
			commandArgs.push(token.value);
			continue;
		}

		if (token.kind === 'option') {
			commandArgs.push(token.rawName);

			if (!token.inlineValue && typeof token.value === 'string') {
				commandArgs.push(token.value);
			}
		}
	}

	return {
		skipBuild,
		exampleArg,
		commandArgs,
	};
}

async function main(): Promise<void> {
	const { skipBuild, exampleArg, commandArgs } = parseCliOptions();

	if (!exampleArg) {
		throw new Error('Usage: pnpm run example:local-npm -- [--skip-build] <example-dir> [command...]');
	}

	const exampleDir = path.resolve(repoRoot, exampleArg);
	const packageJsonPath = path.join(exampleDir, 'package.json');
	if (!existsSync(packageJsonPath)) {
		throw new Error(`No package.json found in ${exampleDir}`);
	}

	const packageJson = readJson<PackageJson>(packageJsonPath);
	const declaredLocalPackages = collectDeclaredLocalPackages(packageJson);
	assertReferencedLocalPackagesAreDeclared(exampleDir, packageJson);

	if (declaredLocalPackages.length === 0) {
		throw new Error(`No local Ecopages packages referenced by ${path.relative(repoRoot, packageJsonPath)}`);
	}

	const localPackages = Object.keys(localPackageTargets).sort();

	let exitCode = 0;
	if (skipBuild) {
		assertLocalPackageBuildOutputsExist(Array.from(new Set(['ecopages', ...declaredLocalPackages])).sort());
		console.log('Skipping local npm package build.');
	} else {
		console.log('Building local npm packages...');
		exitCode = await runCommand('pnpm', ['run', 'build:npm'], repoRoot);
		if (exitCode !== 0) {
			throw new Error('Failed to build local npm packages');
		}
	}

	const sandboxExampleDir = createSandboxExampleDir(exampleDir);
	const sandboxPackageJsonPath = path.join(sandboxExampleDir, 'package.json');
	const nextPackageJson = createSandboxPackageJson(packageJson, localPackages);

	console.log(`Created sandbox example copy at ${sandboxExampleDir}.`);
	console.log(`Injecting local package overrides into ${path.relative(repoRoot, sandboxPackageJsonPath)}...`);
	writeJson(sandboxPackageJsonPath, nextPackageJson);

	console.log(`Installing example dependencies in ${sandboxExampleDir}...`);
	exitCode = await runExamplePnpm(['install'], sandboxExampleDir);
	if (exitCode !== 0) {
		process.exit(exitCode);
	}

	const command = commandArgs.length > 0 ? commandArgs[0] : 'pnpm';
	const args = commandArgs.length > 0 ? commandArgs.slice(1) : ['dev'];
	console.log(`Running ${[command, ...args].join(' ')} in ${sandboxExampleDir}...`);
	exitCode =
		command === 'pnpm'
			? await runExamplePnpm(args, sandboxExampleDir)
			: await runCommand(command, args, sandboxExampleDir);

	process.exit(exitCode);
}

main().catch(async (error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
