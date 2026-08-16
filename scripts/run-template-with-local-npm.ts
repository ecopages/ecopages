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
	packageManager?: string;
	[key: string]: unknown;
};

type TemplateManifest = {
	templates: Array<{
		source: string;
		packageDirectory: string;
	}>;
};

function readJson<T>(filePath: string): T {
	return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

const repoRoot = path.resolve(import.meta.dirname, '..');
const templatesSandboxRoot = path.join(repoRoot, '.templates');
const templatesRoot = path.join(repoRoot, 'templates');
const templateManifest = readJson<TemplateManifest>(path.join(repoRoot, 'packages/ecopages/templates.json'));
const sourceFilePattern = /\.[cm]?[jt]sx?$/u;

const localPackageTargets: Record<string, string> = {
	ecopages: 'packages/ecopages/dist',
	'@ecopages/browser-router': 'packages/browser-router/dist',
	'@ecopages/core': 'packages/core/dist',
	'@ecopages/file-system': 'packages/file-system/dist',
	'@ecopages/ecopages-jsx': 'packages/integrations/ecopages-jsx/dist',
	'@ecopages/content-processor': 'packages/processors/content-processor/dist',
	'@ecopages/kitajs': 'packages/integrations/kitajs/dist',
	'@ecopages/lit': 'packages/integrations/lit/dist',
	'@ecopages/mdx': 'packages/integrations/mdx/dist',
	'@ecopages/react': 'packages/integrations/react/dist',
	'@ecopages/react-router': 'packages/react-router/dist',
	'@ecopages/image-processor': 'packages/processors/image-processor/dist',
	'@ecopages/postcss-processor': 'packages/processors/postcss-processor/dist',
};

const rootPackageJson = readJson<PackageJson>(path.join(repoRoot, 'package.json'));

function writeJson(filePath: string, value: unknown): void {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function toFileSpec(targetPath: string): string {
	return pathToFileURL(targetPath).href;
}

/**
 * Finds Ecopages packages already declared by the template manifest.
 *
 * This is used as a guard so the script only runs for templates that are
 * actually built on top of local Ecopages packages.
 */
function collectDeclaredLocalPackages(packageJson: PackageJson): string[] {
	const declared = new Set<string>();

	for (const block of [
		packageJson.dependencies,
		packageJson.devDependencies,
		packageJson.peerDependencies,
		packageJson.optionalDependencies,
	]) {
		for (const packageName of Object.keys(block ?? {})) {
			if (packageName in localPackageTargets) {
				declared.add(packageName);
			}
		}
	}

	return Array.from(declared).sort();
}

/**
 * Finds Ecopages packages referenced in source files inside the template.
 */
function collectReferencedLocalPackagesFromFiles(templateDir: string): string[] {
	const referenced = new Set<string>();
	const pendingDirs = [templateDir];

	while (pendingDirs.length > 0) {
		const currentDir = pendingDirs.pop();
		if (!currentDir) {
			continue;
		}

		for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
			const entryPath = path.join(currentDir, entry.name);

			if (entry.isDirectory()) {
				if (shouldCopyTemplatePath(entryPath)) {
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
 * explicitly in the template manifest.
 */
function assertReferencedLocalPackagesAreDeclared(templateDir: string, packageJson: PackageJson): void {
	const declared = new Set(collectDeclaredLocalPackages(packageJson));
	const referenced = new Set([
		...collectReferencedLocalPackagesFromFiles(templateDir),
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
			`Missing Ecopages dependencies in ${path.relative(repoRoot, path.join(templateDir, 'package.json'))}:`,
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
		const env =
			command === 'bun'
				? {
						...process.env,
						npm_config_user_agent: process.env.npm_config_user_agent?.startsWith('bun/')
							? process.env.npm_config_user_agent
							: 'bun/1.0.0',
					}
				: undefined;
		const child = spawn(command, args, {
			cwd,
			stdio: 'inherit',
			shell: false,
			env,
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

function runTemplatePnpm(args: string[], cwd: string): Promise<number> {
	return runCommand('pnpm', args, cwd);
}

function shouldCopyTemplatePath(sourcePath: string): boolean {
	const name = path.basename(sourcePath);
	return (
		name !== 'node_modules' && name !== 'dist' && name !== '.eco' && name !== '.env' && name !== 'pnpm-lock.yaml'
	);
}

/**
 * Resolves the template package directory from `templates.json` instead of
 * guessing nested layouts like `app/`.
 */
function resolveTemplatePackageDir(templateDir: string): string {
	if (existsSync(path.join(templateDir, 'package.json'))) {
		return templateDir;
	}

	const relative = path.relative(templatesRoot, templateDir);
	if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
		const source = relative.split(path.sep)[0];
		const template = templateManifest.templates.find((entry) => entry.source === source);
		if (template) {
			const packageDir = path.join(templatesRoot, template.source, template.packageDirectory);
			if (existsSync(path.join(packageDir, 'package.json'))) {
				return packageDir;
			}
		}
	}

	throw new Error(`No package.json found in ${templateDir}`);
}

/**
 * Keeps the sandbox layout short for templates while still supporting non-template
 * paths if the script is ever pointed elsewhere.
 */
function getSandboxRelativePath(templateDir: string): string {
	if (templateDir.startsWith(`${templatesRoot}${path.sep}`)) {
		return path.relative(templatesRoot, templateDir);
	}

	return path.relative(repoRoot, templateDir);
}

/**
 * Creates a fresh sandbox copy for the requested template under `.templates`.
 */
function createSandboxTemplateDir(templateDir: string): string {
	const sandboxTemplateDir = path.join(templatesSandboxRoot, getSandboxRelativePath(templateDir));
	rmSync(sandboxTemplateDir, { recursive: true, force: true });
	mkdirSync(path.dirname(sandboxTemplateDir), { recursive: true });
	cpSync(templateDir, sandboxTemplateDir, {
		recursive: true,
		filter: shouldCopyTemplatePath,
	});
	rmSync(path.join(sandboxTemplateDir, '.eco'), { recursive: true, force: true });
	writeFileSync(
		path.join(sandboxTemplateDir, 'pnpm-workspace.yaml'),
		['packages:', "  - '**'", 'allowBuilds:', '  bun: true', '  esbuild: true', '  sharp: true', ''].join('\n'),
		'utf-8',
	);
	return sandboxTemplateDir;
}

/**
 * Materializes workspace ranges as file dependencies so the sandbox can be
 * installed as its own workspace without relying on the monorepo graph.
 */
function createSandboxPackageJson(packageJson: PackageJson, packageNames: string[]): PackageJson {
	const nextPackageJson: PackageJson = {
		...packageJson,
		type: packageJson.type ?? 'module',
		packageManager: rootPackageJson.packageManager,
		dependencies: packageJson.dependencies ? { ...packageJson.dependencies } : undefined,
		devDependencies: packageJson.devDependencies ? { ...packageJson.devDependencies } : undefined,
		peerDependencies: packageJson.peerDependencies ? { ...packageJson.peerDependencies } : undefined,
		optionalDependencies: packageJson.optionalDependencies ? { ...packageJson.optionalDependencies } : undefined,
	};

	for (const blockName of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
		const block = nextPackageJson[blockName];
		if (!block) continue;

		for (const packageName of packageNames) {
			if (block[packageName] === 'workspace:*') {
				block[packageName] = toFileSpec(path.join(repoRoot, localPackageTargets[packageName]));
			}
		}
	}

	const unresolved = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap(
		(blockName) =>
			Object.entries(nextPackageJson[blockName] ?? {})
				.filter(([, version]) => typeof version === 'string' && version.startsWith('workspace:'))
				.map(([packageName]) => packageName),
	);
	if (unresolved.length > 0) {
		throw new Error(`Sandbox manifest still contains workspace dependencies: ${unresolved.sort().join(', ')}`);
	}

	return nextPackageJson;
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
	templateArg?: string;
	commandArgs: string[];
};

/**
 * Parses runner options before the template path.
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
	let templateArg: string | undefined;
	const commandArgs: string[] = [];

	for (const token of parsed.tokens ?? []) {
		if (!templateArg) {
			if (token.kind === 'option' && token.name === 'skip-build') {
				skipBuild = true;
				continue;
			}

			if (token.kind === 'positional' && token.value === '--skip-build') {
				skipBuild = true;
				continue;
			}

			if (token.kind === 'positional') {
				templateArg = token.value;
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
		templateArg,
		commandArgs,
	};
}

async function main(): Promise<void> {
	const { skipBuild, templateArg, commandArgs } = parseCliOptions();

	if (!templateArg) {
		throw new Error('Usage: pnpm run template:local-npm -- [--skip-build] <template-dir> [command...]');
	}

	const templateDir = path.resolve(repoRoot, templateArg);
	const templatePackageDir = resolveTemplatePackageDir(templateDir);
	const packageJsonPath = path.join(templatePackageDir, 'package.json');

	const packageJson = readJson<PackageJson>(packageJsonPath);
	const declaredLocalPackages = collectDeclaredLocalPackages(packageJson);
	assertReferencedLocalPackagesAreDeclared(templatePackageDir, packageJson);

	if (declaredLocalPackages.length === 0) {
		throw new Error(`No local Ecopages packages referenced by ${path.relative(repoRoot, packageJsonPath)}`);
	}

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

	const sandboxTemplateDir = createSandboxTemplateDir(templateDir);
	const sandboxPackageDir = path.relative(templateDir, templatePackageDir)
		? path.join(sandboxTemplateDir, path.relative(templateDir, templatePackageDir))
		: sandboxTemplateDir;
	const sandboxPackageJsonPath = path.join(sandboxPackageDir, 'package.json');
	const nextPackageJson = createSandboxPackageJson(packageJson, declaredLocalPackages);

	console.log(`Created sandbox template copy at ${sandboxTemplateDir}.`);
	console.log(`Injecting local package overrides into ${path.relative(repoRoot, sandboxPackageJsonPath)}...`);
	writeJson(sandboxPackageJsonPath, nextPackageJson);

	console.log(`Installing template dependencies in ${sandboxPackageDir}...`);
	exitCode = await runTemplatePnpm(['install'], sandboxPackageDir);
	if (exitCode !== 0) {
		process.exit(exitCode);
	}

	const command = commandArgs.length > 0 ? commandArgs[0] : 'pnpm';
	const args = commandArgs.length > 0 ? commandArgs.slice(1) : ['dev'];
	console.log(`Running ${[command, ...args].join(' ')} in ${sandboxPackageDir}...`);
	exitCode =
		command === 'pnpm'
			? await runTemplatePnpm(args, sandboxPackageDir)
			: await runCommand(command, args, sandboxPackageDir);

	process.exit(exitCode);
}

main().catch(async (error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
