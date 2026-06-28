import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { findAllPackageDirs, getBundleDependencyNames, type BundleManifest } from './bundle-workspace-deps.ts';
import { readJsonFile, rewriteWorkspaceRanges, writeJsonFile } from './package-utils.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');

const ignoredEntries = new Set(['node_modules', 'dist', '.jsr-publish', '.git']);

function copyPackageTree(sourceRoot: string, destinationRoot: string, relativePath = '.'): void {
	const absoluteSource = path.join(sourceRoot, relativePath);
	const stats = statSync(absoluteSource);

	if (stats.isDirectory()) {
		if (ignoredEntries.has(path.basename(absoluteSource))) {
			return;
		}

		mkdirSync(path.join(destinationRoot, relativePath), { recursive: true });
		for (const entry of readdirSync(absoluteSource)) {
			copyPackageTree(sourceRoot, destinationRoot, path.join(relativePath, entry));
		}
		return;
	}

	mkdirSync(path.dirname(path.join(destinationRoot, relativePath)), { recursive: true });
	copyFileSync(absoluteSource, path.join(destinationRoot, relativePath));
}

function copyBundledSourceDependencies(
	manifest: BundleManifest,
	publishDir: string,
	packageDirsByName: Map<string, string>,
): void {
	for (const packageName of getBundleDependencyNames(manifest)) {
		const packageDir = packageDirsByName.get(packageName);
		if (!packageDir) {
			throw new Error(
				`${manifest.name} lists ${packageName} in bundleDependencies, but no workspace package was found.`,
			);
		}

		const destination = path.join(publishDir, 'node_modules', ...packageName.split('/'));
		cpSync(packageDir, destination, {
			recursive: true,
			filter: (sourcePath) => {
				const basename = path.basename(sourcePath);
				return !ignoredEntries.has(basename);
			},
		});
	}
}

function patchJsrPublishIncludes(publishDir: string, bundledPackageNames: string[]): void {
	const jsrJsonPath = path.join(publishDir, 'jsr.json');
	if (!existsSync(jsrJsonPath)) {
		return;
	}

	const jsrConfig = readJsonFile<Record<string, unknown>>(jsrJsonPath);
	if (!jsrConfig.publish || typeof jsrConfig.publish !== 'object' || Array.isArray(jsrConfig.publish)) {
		return;
	}

	const publishConfig = jsrConfig.publish as { include?: string[]; exclude?: string[] };
	const include = new Set(publishConfig.include ?? []);

	for (const packageName of bundledPackageNames) {
		const nodeModulesPath = path.posix.join('node_modules', ...packageName.split('/'));
		include.add(`${nodeModulesPath}/**/*.ts`);
		include.add(`${nodeModulesPath}/**/*.tsx`);
		include.add(`${nodeModulesPath}/package.json`);
	}

	jsrConfig.publish = {
		...publishConfig,
		include: Array.from(include).sort(),
	};

	writeJsonFile(jsrJsonPath, jsrConfig);
}

export function prepareJsrPublishDirectory(packageDir: string, version: string): string {
	const publishDir = path.join(packageDir, '.jsr-publish');
	const manifest = readJsonFile<BundleManifest>(path.join(packageDir, 'package.json'));
	const packageDirsByName = findAllPackageDirs(packagesRoot);
	const bundledPackageNames = getBundleDependencyNames(manifest);

	rmSync(publishDir, { recursive: true, force: true });
	mkdirSync(publishDir, { recursive: true });
	copyPackageTree(packageDir, publishDir);
	copyBundledSourceDependencies(manifest, publishDir, packageDirsByName);

	const stagedManifest: BundleManifest = {
		...manifest,
		version,
		dependencies: rewriteWorkspaceRanges(manifest.dependencies, version),
		peerDependencies: rewriteWorkspaceRanges(manifest.peerDependencies, version),
		optionalDependencies: rewriteWorkspaceRanges(manifest.optionalDependencies, version),
	};

	writeJsonFile(path.join(publishDir, 'package.json'), stagedManifest);
	patchJsrPublishIncludes(publishDir, bundledPackageNames);

	return publishDir;
}

function main(): void {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			publish: {
				type: 'boolean',
				default: false,
			},
		},
	});

	const packageInput = positionals[0];
	if (!packageInput) {
		throw new Error('Usage: node scripts/prepare-jsr-publish.ts <package-dir> [--publish]');
	}

	const packageDir = path.resolve(packageInput);
	const rootPackage = readJsonFile<{ version: string }>(path.join(repoRoot, 'package.json'));
	if (!rootPackage.version) {
		throw new Error('Root package.json does not have a version.');
	}

	const publishDir = prepareJsrPublishDirectory(packageDir, rootPackage.version);
	console.log(`Prepared JSR publish directory -> ${path.relative(repoRoot, publishDir)}`);

	if (!values.publish) {
		return;
	}

	const publishResult = spawnSync('bunx', ['jsr', 'publish'], {
		cwd: publishDir,
		stdio: 'inherit',
		env: process.env,
	});

	if (publishResult.error) {
		throw publishResult.error;
	}

	if (typeof publishResult.status === 'number' && publishResult.status !== 0) {
		process.exitCode = publishResult.status;
	}
}

if (import.meta.main) {
	main();
}
