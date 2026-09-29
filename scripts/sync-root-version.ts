import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readJsonFile } from './package-utils.ts';

type VersionedManifest = {
	version?: string;
};

/**
 * Rewrites the first `"version"` field without reformatting the rest of the file.
 */
export function withPackageVersion(source: string, version: string): string {
	if (!/"version"\s*:\s*"/u.test(source)) {
		throw new Error('package.json has no version field');
	}

	return source.replace(
		/("version"\s*:\s*")([^"]*)(")/u,
		(_match, prefix: string, _old: string, suffix: string) => `${prefix}${version}${suffix}`,
	);
}

/**
 * Copies the published CLI version onto the private workspace root manifest.
 *
 * @remarks
 * The root package is not a pnpm workspace member, so Changesets cannot put it in the fixed group.
 */
export function syncRootVersionFromCli(
	rootPackageJsonPath: string,
	cliPackageJsonPath: string,
): { version: string; changed: boolean } {
	const cli = readJsonFile<VersionedManifest>(cliPackageJsonPath);
	if (typeof cli.version !== 'string' || cli.version.length === 0) {
		throw new Error(`Missing version in ${cliPackageJsonPath}`);
	}

	const source = readFileSync(rootPackageJsonPath, 'utf8');
	const next = withPackageVersion(source, cli.version);
	if (next === source) {
		return { version: cli.version, changed: false };
	}

	writeFileSync(rootPackageJsonPath, next, 'utf8');
	return { version: cli.version, changed: true };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
	const repoRoot = path.resolve(import.meta.dirname, '..');
	const result = syncRootVersionFromCli(
		path.join(repoRoot, 'package.json'),
		path.join(repoRoot, 'packages/ecopages/package.json'),
	);
	console.log(
		result.changed
			? `Synced workspace root version to ${result.version}`
			: `Workspace root already at ${result.version}`,
	);
}
