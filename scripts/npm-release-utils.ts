import path from 'node:path';
import { appendFileSync, readFileSync } from 'node:fs';

export type PackageManifest = {
	name: string;
	version?: string;
};

type RegistryPackageMetadata = {
	versions?: Record<string, unknown>;
};

export const repoRoot = path.resolve(import.meta.dirname, '..');

export function readJsonFile<T>(filePath: string): T {
	return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

export function resolveManifestPath(inputPath: string): string {
	const absolutePath = path.resolve(repoRoot, inputPath);
	if (path.basename(absolutePath) === 'package.json') {
		return absolutePath;
	}

	return path.join(absolutePath, 'package.json');
}

export function setGithubOutput(name: string, value: string): void {
	const githubOutputPath = process.env.GITHUB_OUTPUT;
	if (!githubOutputPath) {
		return;
	}

	appendFileSync(githubOutputPath, `${name}=${value}\n`, 'utf-8');
}

export function readPackageManifest(inputPath: string): { manifest: PackageManifest; manifestPath: string } {
	const manifestPath = resolveManifestPath(inputPath);
	const manifest = readJsonFile<PackageManifest>(manifestPath);

	if (!manifest.version) {
		throw new Error(`Missing version in ${manifestPath}`);
	}

	return { manifest, manifestPath };
}

export function getDistTag(version: string): string {
	const match = version.match(/-([0-9A-Za-z-]+)\./);
	return match ? match[1] : 'latest';
}

export async function isVersionPublished(packageName: string, version: string): Promise<boolean> {
	const packageUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
	const response = await fetch(packageUrl, {
		headers: {
			accept: 'application/json',
		},
	});

	if (response.status === 404) {
		return false;
	}

	if (!response.ok) {
		throw new Error(`Failed to query npm registry for ${packageName}: ${response.status} ${response.statusText}`);
	}

	const metadata = (await response.json()) as RegistryPackageMetadata;
	return Boolean(metadata.versions && version in metadata.versions);
}
