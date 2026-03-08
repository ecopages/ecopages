import path from 'node:path';
import { Logger } from '@ecopages/logger';
import { isVersionPublished, readPackageManifest, repoRoot, setGithubOutput } from './npm-release-utils.ts';

const appLogger = new Logger('[NPM Package Check]');

function getManifestInput(): string | undefined {
	const args = process.argv.slice(2);
	return args[0] === '--' ? args[1] : args[0];
}

async function main(): Promise<void> {
	const manifestInput = getManifestInput();
	if (!manifestInput) {
		throw new Error('Usage: tsx scripts/check-npm-package-published.ts <package-dir-or-package-json>');
	}

	const { manifest, manifestPath } = readPackageManifest(manifestInput);

	const published = await isVersionPublished(manifest.name, manifest.version);
	const status = published ? 'published' : 'unpublished';
	const relativePath = path.relative(repoRoot, manifestPath);

	setGithubOutput('status', status);
	setGithubOutput('package-name', manifest.name);
	setGithubOutput('package-version', manifest.version);

	if (published) {
		appLogger.info(`${manifest.name}@${manifest.version} already exists on npm (${relativePath})`);
		return;
	}

	appLogger.info(`${manifest.name}@${manifest.version} is not published yet (${relativePath})`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
