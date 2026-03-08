import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Logger } from '@ecopages/logger';
import { getDistTag, isVersionPublished, readPackageManifest, repoRoot } from './npm-release-utils.ts';

const appLogger = new Logger('[NPM Release]');

function getManifestInput(): string | undefined {
	const args = process.argv.slice(2);
	return args[0] === '--' ? args[1] : args[0];
}

async function main(): Promise<void> {
	const manifestInput = getManifestInput();
	if (!manifestInput) {
		throw new Error('Usage: tsx scripts/release-npm-package.ts <package-dir-or-package-json>');
	}

	const { manifest, manifestPath } = readPackageManifest(manifestInput);
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
