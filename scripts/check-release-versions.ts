import path from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { Logger } from '@ecopages/logger';

type PackageManifest = {
	name: string;
	private?: boolean;
	version?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

type JsrManifest = {
	name: string;
	version?: string;
};

type VersionMismatch = {
	filePath: string;
	expected: string;
	actual?: string;
};

type DependencyField = 'dependencies' | 'peerDependencies' | 'optionalDependencies' | 'devDependencies';

type WorkspaceRangeMismatch = {
	packageName: string;
	dependencyName: string;
	field: DependencyField;
	actual: string;
};

const appLogger = new Logger('[Release Version Check]');
const repoRoot = path.resolve(import.meta.dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');
const rootPackageJsonPath = path.join(repoRoot, 'package.json');
const dependencyFields: DependencyField[] = [
	'dependencies',
	'peerDependencies',
	'optionalDependencies',
	'devDependencies',
];

function readJsonFile<T>(filePath: string): T {
	return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function isPublishablePackageManifest(packageJsonPath: string): boolean {
	if (packageJsonPath.includes(`${path.sep}__fixtures__${path.sep}`)) {
		return false;
	}

	const manifest = readJsonFile<PackageManifest>(packageJsonPath);
	return !manifest.private && manifest.scripts?.['release:jsr'] === 'bunx jsr publish';
}

function findPublishablePackageDirs(dir: string): string[] {
	const results: string[] = [];

	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === 'dist' || entry === '__fixtures__') {
			continue;
		}

		const fullPath = path.join(dir, entry);
		if (statSync(fullPath).isDirectory()) {
			results.push(...findPublishablePackageDirs(fullPath));
			continue;
		}

		if (entry !== 'package.json') {
			continue;
		}

		if (isPublishablePackageManifest(fullPath)) {
			results.push(path.dirname(fullPath));
		}
	}

	return results;
}

export function collectInternalWorkspaceRangeMismatches(manifests: PackageManifest[]): WorkspaceRangeMismatch[] {
	const publishablePackageNames = new Set(manifests.map((manifest) => manifest.name));
	const mismatches: WorkspaceRangeMismatch[] = [];

	for (const manifest of manifests) {
		for (const field of dependencyFields) {
			const record = manifest[field];
			if (!record) {
				continue;
			}

			for (const [dependencyName, range] of Object.entries(record)) {
				if (!publishablePackageNames.has(dependencyName) || range === 'workspace:*') {
					continue;
				}

				mismatches.push({
					packageName: manifest.name,
					dependencyName,
					field,
					actual: range,
				});
			}
		}
	}

	return mismatches;
}

function collectVersionMismatches(
	expectedVersion: string,
	packageDirs: string[],
	cliManifestPath: string,
): VersionMismatch[] {
	const mismatches: VersionMismatch[] = [];

	for (const packageDir of packageDirs) {
		const packageJsonPath = path.join(packageDir, 'package.json');
		const packageJson = readJsonFile<PackageManifest>(packageJsonPath);
		if (packageJson.version !== expectedVersion) {
			mismatches.push({
				filePath: packageJsonPath,
				expected: expectedVersion,
				actual: packageJson.version,
			});
		}

		const jsrJsonPath = path.join(packageDir, 'jsr.json');
		const jsrJson = readJsonFile<JsrManifest>(jsrJsonPath);
		if (jsrJson.version !== expectedVersion) {
			mismatches.push({
				filePath: jsrJsonPath,
				expected: expectedVersion,
				actual: jsrJson.version,
			});
		}
	}

	const cliManifest = readJsonFile<PackageManifest>(cliManifestPath);
	if (cliManifest.version !== expectedVersion) {
		mismatches.push({
			filePath: cliManifestPath,
			expected: expectedVersion,
			actual: cliManifest.version,
		});
	}

	return mismatches;
}

function main(): void {
	const rootPackageJson = readJsonFile<PackageManifest>(rootPackageJsonPath);
	if (!rootPackageJson.version) {
		throw new Error('Root package.json does not have a version');
	}

	const packageDirs = findPublishablePackageDirs(packagesRoot).sort();
	const cliManifestPath = path.join(repoRoot, 'packages', 'ecopages', 'package.json');
	const versionMismatches = collectVersionMismatches(rootPackageJson.version, packageDirs, cliManifestPath);
	const releaseManifests = [
		...packageDirs.map((packageDir) => readJsonFile<PackageManifest>(path.join(packageDir, 'package.json'))),
		readJsonFile<PackageManifest>(cliManifestPath),
	];
	const workspaceRangeMismatches = collectInternalWorkspaceRangeMismatches(releaseManifests);

	if (versionMismatches.length > 0 || workspaceRangeMismatches.length > 0) {
		const versionDetails = versionMismatches
			.map((mismatch) => {
				const relativePath = path.relative(repoRoot, mismatch.filePath);
				return `- ${relativePath}: expected ${mismatch.expected}, found ${mismatch.actual ?? 'missing'}`;
			})
			.join('\n');
		const workspaceRangeDetails = workspaceRangeMismatches
			.map((mismatch) => {
				return `- ${mismatch.packageName} ${mismatch.field}.${mismatch.dependencyName}: expected workspace:*, found ${mismatch.actual}`;
			})
			.join('\n');
		const details = [
			versionDetails ? `Version mismatches:\n${versionDetails}` : '',
			workspaceRangeDetails ? `Internal package range mismatches:\n${workspaceRangeDetails}` : '',
		]
			.filter(Boolean)
			.join('\n');

		throw new Error(
			`Release versions are not synced:\n${details}\nRun pnpm run jsr:sync-version and replace same-repo package ranges with workspace:* before publishing.`,
		);
	}

	appLogger.info(`All release package versions match ${rootPackageJson.version}`);
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
