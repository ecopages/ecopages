import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import {
	readJsonFile,
	rewriteWorkspaceRanges,
	writeJsonFile,
	type WorkspaceDependencyManifest,
} from './package-utils.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

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

export function prepareJsrPublishDirectory(packageDir: string, version: string): string {
	const publishDir = path.join(packageDir, '.jsr-publish');
	const manifest = readJsonFile<WorkspaceDependencyManifest>(path.join(packageDir, 'package.json'));

	rmSync(publishDir, { recursive: true, force: true });
	mkdirSync(publishDir, { recursive: true });
	copyPackageTree(packageDir, publishDir);

	const stagedManifest: WorkspaceDependencyManifest = {
		...manifest,
		version,
		dependencies: rewriteWorkspaceRanges(manifest.dependencies, version),
		peerDependencies: rewriteWorkspaceRanges(manifest.peerDependencies, version),
		optionalDependencies: rewriteWorkspaceRanges(manifest.optionalDependencies, version),
	};

	writeJsonFile(path.join(publishDir, 'package.json'), stagedManifest);

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
