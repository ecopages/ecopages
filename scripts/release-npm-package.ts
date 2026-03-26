import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { Logger } from '@ecopages/logger';
import { getDistTag, isVersionPublished, readPackageManifest, repoRoot } from './npm-release-utils.ts';

const appLogger = new Logger('[NPM Release]');

type PublishManifest = {
	name: string;
	version: string;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	overrides?: Record<string, string>;
};

function getManifestInput(): string | undefined {
	const { positionals } = parseArgs({
		allowPositionals: true,
	});

	return positionals[0];
}

function findWorkspaceRanges(manifest: PublishManifest): string[] {
	const dependencyFields = [
		['dependencies', manifest.dependencies],
		['peerDependencies', manifest.peerDependencies],
		['optionalDependencies', manifest.optionalDependencies],
		['overrides', manifest.overrides],
	] as const;

	return dependencyFields.flatMap(([field, record]) =>
		Object.entries(record ?? {})
			.filter(([, range]) => range.startsWith('workspace:'))
			.map(([name, range]) => `${field}.${name}=${range}`),
	);
}

function assertPublishableManifest(manifest: PublishManifest, manifestPath: string): void {
	const workspaceRanges = findWorkspaceRanges(manifest);
	if (workspaceRanges.length === 0) {
		return;
	}

	throw new Error(
		`Refusing to publish ${manifest.name}@${manifest.version} from ${manifestPath}; unresolved workspace ranges remain: ${workspaceRanges.join(', ')}`,
	);
}

async function main(): Promise<void> {
	const manifestInput = getManifestInput();
	if (!manifestInput) {
		throw new Error(
			'Usage: node --experimental-strip-types scripts/release-npm-package.ts <package-dir-or-package-json>',
		);
	}

	const { manifest, manifestPath } = readPackageManifest(manifestInput);
	assertPublishableManifest(manifest as PublishManifest, manifestPath);
	const packageDir = path.dirname(manifestPath);
	const relativePath = path.relative(repoRoot, manifestPath);

	if (await isVersionPublished(manifest.name, manifest.version)) {
		appLogger.info(`Skipping ${manifest.name}@${manifest.version}; already published (${relativePath})`);
		return;
	}

	const distTag = getDistTag(manifest.version);
	appLogger.info(`Publishing ${manifest.name}@${manifest.version} with tag ${distTag} (${relativePath})`);

	const publishResult = spawnSync('npm', ['publish', '--access', 'public', '--provenance', '--tag', distTag], {
		cwd: packageDir,
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

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
