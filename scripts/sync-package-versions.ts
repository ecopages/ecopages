import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@ecopages/logger';
import { readJsonFile } from './package-utils.ts';

type PackageManifest = {
	name: string;
	private?: boolean;
	version?: string;
};

const repoRoot = path.resolve(import.meta.dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');
const rootPackage = readJsonFile<{ version?: string }>(path.join(repoRoot, 'package.json'));
const appLogger = new Logger('[Sync Package Versions]');

if (!rootPackage.version) {
	throw new Error('Root package.json does not have a version');
}

function isSkippedDirectory(name: string): boolean {
	return name === 'node_modules' || name === 'dist' || name === '__fixtures__';
}

function findPublishablePackageJsonPaths(dir: string): string[] {
	const results: string[] = [];

	for (const entry of readdirSync(dir)) {
		if (isSkippedDirectory(entry)) {
			continue;
		}

		const fullPath = path.join(dir, entry);
		if (statSync(fullPath).isDirectory()) {
			results.push(...findPublishablePackageJsonPaths(fullPath));
			continue;
		}

		if (entry !== 'package.json') {
			continue;
		}

		const manifest = readJsonFile<PackageManifest>(fullPath);
		if (!manifest.private) {
			results.push(fullPath);
		}
	}

	return results;
}

const expectedVersion = rootPackage.version;
const packageJsonPaths = findPublishablePackageJsonPaths(packagesRoot).sort();

for (const packageJsonPath of packageJsonPaths) {
	const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as PackageManifest;
	const previousVersion = manifest.version;
	manifest.version = expectedVersion;
	writeFileSync(packageJsonPath, `${JSON.stringify(manifest, null, '\t')}\n`, 'utf-8');
	appLogger.info(`${manifest.name}: ${previousVersion} > ${expectedVersion}`);
}
