import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { Logger } from '@ecopages/logger';
import rootPackage from '../package.json';

type BumpType = 'major' | 'minor' | 'patch';
type PrereleaseChannel = 'alpha' | 'beta';

const BUMP_INDEX: Record<BumpType, number> = {
	major: 0,
	minor: 1,
	patch: 2,
};

type ParsedVersion = {
	major: number;
	minor: number;
	patch: number;
	prerelease?: {
		channel: string;
		number: number;
	};
};

/**
 * Computes the next version string given the current version and bump type.
 */
function computeNextVersion(current: string, bump: BumpType): string {
	const parts = current
		.split('-')[0]
		.split('.')
		.map(Number);
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
	writeFileSync(packageJsonPath, JSON.stringify(rootPackage, null, 2) + '\n', 'utf-8');
}

function parseVersion(version: string): ParsedVersion {
	const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/i);
	if (!match) {
		throw new Error(`Invalid version: ${version}`);
	}

	const [, major, minor, patch, channel, prereleaseNumber] = match;
	return {
		major: Number(major),
		minor: Number(minor),
		patch: Number(patch),
		prerelease:
			channel && prereleaseNumber
				? {
					channel,
					number: Number(prereleaseNumber),
				}
				: undefined,
	};
}

function formatVersion(version: ParsedVersion): string {
	const stable = `${version.major}.${version.minor}.${version.patch}`;
	if (!version.prerelease) {
		return stable;
	}

	return `${stable}-${version.prerelease.channel}.${version.prerelease.number}`;
}

function computeNextPrerelease(current: string, channel: PrereleaseChannel, bump: BumpType = 'patch'): string {
	const parsed = parseVersion(current);

	if (parsed.prerelease?.channel === channel) {
		return formatVersion({
			...parsed,
			prerelease: {
				channel,
				number: parsed.prerelease.number + 1,
			},
		});
	}

	const baseVersion = parsed.prerelease ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : current;
	const nextStable = computeNextVersion(baseVersion, bump);
	const nextParsed = parseVersion(nextStable);

	return formatVersion({
		...nextParsed,
		prerelease: {
			channel,
			number: 0,
		},
	});
}

if (!rootPackage.version) {
	throw new Error('Root package.json does not have a version');
}

const appLogger = new Logger('[@ecopages/bump-version]');
const command = process.argv[2] ?? 'patch';

if (command === 'prerelease') {
	const channel = process.argv[3] as PrereleaseChannel | undefined;
	const bump = (process.argv[4] as BumpType | undefined) ?? 'patch';

	if (channel !== 'alpha' && channel !== 'beta') {
		throw new Error(`Invalid prerelease channel: ${channel ?? 'undefined'}`);
	}

	if (!(bump in BUMP_INDEX)) {
		throw new Error(`Invalid bump type: ${bump}`);
	}

	const newVersion = computeNextPrerelease(rootPackage.version, channel, bump);
	appLogger.info(`Updating prerelease version to v${newVersion}`);
	writeRootVersion(newVersion);
	process.exit(0);
}

const bump = command as BumpType;

if (!(bump in BUMP_INDEX)) {
	throw new Error(`Invalid bump type: ${bump}`);
}

const newVersion = computeNextVersion(rootPackage.version, bump);
appLogger.info(`Updating ${bump} version to v${newVersion}`);
writeRootVersion(newVersion);
