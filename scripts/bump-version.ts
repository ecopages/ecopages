import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { Logger } from '@ecopages/logger';
import rootPackage from '../package.json';

type BumpType = 'major' | 'minor' | 'patch';

const BUMP_INDEX: Record<BumpType, number> = {
	major: 0,
	minor: 1,
	patch: 2,
};

/**
 * Computes the next version string given the current version and bump type.
 */
function computeNextVersion(current: string, bump: BumpType): string {
	const parts = current.split('.').map(Number);
	parts[BUMP_INDEX[bump]]++;
	if (bump === 'minor') parts[2] = 0;
	if (bump === 'major') {
		parts[1] = 0;
		parts[2] = 0;
	}
	return parts.join('.');
}

/**
 * Updates the root package.json with the new version.
 */
function writeRootVersion(version: string): void {
	const packageJsonPath = path.resolve(import.meta.dirname, '../package.json');
	rootPackage.version = version;
	writeFileSync(packageJsonPath, JSON.stringify(rootPackage, null, 2), 'utf-8');
}

if (!rootPackage.version) {
	throw new Error('Root package.json does not have a version');
}

const bump = (process.argv[2] as BumpType) || 'patch';

if (!BUMP_INDEX[bump]) {
	throw new Error(`Invalid bump type: ${bump}`);
}

const appLogger = new Logger('[@ecopages/bump-version]');
const newVersion = computeNextVersion(rootPackage.version, bump);

appLogger.info(`Updating ${bump} version to v${newVersion}`);

writeRootVersion(newVersion);
