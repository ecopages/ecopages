import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Logger } from '@ecopages/logger';
type RootPackage = {
	version?: string;
};

const rootPackageJsonPath = path.resolve(import.meta.dirname, '../package.json');

function readRootPackage(): RootPackage {
	return JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8')) as RootPackage;
}

const rootPackage = readRootPackage();


type BumpType = 'major' | 'minor' | 'patch';
type PrereleaseChannel = 'alpha' | 'beta';
type Command = BumpType | 'prerelease';

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
	const parts = current.split('-')[0].split('.').map(Number);
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
	rootPackage.version = version;
	writeFileSync(rootPackageJsonPath, JSON.stringify(rootPackage, null, 2) + '\n', 'utf-8');
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

function isBumpType(value: string | undefined): value is BumpType {
	return value === 'major' || value === 'minor' || value === 'patch';
}

function isPrereleaseChannel(value: string | undefined): value is PrereleaseChannel {
	return value === 'alpha' || value === 'beta';
}

function printUsage(): void {
	console.log(`Usage:
	node --experimental-strip-types scripts/bump-version.ts [patch|minor|major]
	node --experimental-strip-types scripts/bump-version.ts prerelease <alpha|beta> [patch|minor|major]

Options:
  --channel <alpha|beta>
  --bump <patch|minor|major>
  --dry-run
  -h, --help`);
}

if (!rootPackage.version) {
	throw new Error('Root package.json does not have a version');
}

const appLogger = new Logger('[@ecopages/bump-version]');
const parsedArgs = parseArgs({
	allowPositionals: true,
	options: {
		channel: {
			type: 'string',
		},
		bump: {
			type: 'string',
		},
		'dry-run': {
			type: 'boolean',
		},
		help: {
			type: 'boolean',
			short: 'h',
		},
	},
});

if (parsedArgs.values.help) {
	printUsage();
	process.exit(0);
}

const [commandPositional, channelPositional, bumpPositional] = parsedArgs.positionals;
const command = (commandPositional ?? 'patch') as Command;
const dryRun = parsedArgs.values['dry-run'] ?? false;

if (command === 'prerelease') {
	const channel = parsedArgs.values.channel ?? channelPositional;
	const bump = parsedArgs.values.bump ?? bumpPositional ?? 'patch';

	if (!isPrereleaseChannel(channel)) {
		throw new Error(`Invalid prerelease channel: ${channel ?? 'undefined'}`);
	}

	if (!isBumpType(bump)) {
		throw new Error(`Invalid bump type: ${bump}`);
	}

	const newVersion = computeNextPrerelease(rootPackage.version, channel, bump);
	appLogger.info(`${dryRun ? 'Would update' : 'Updating'} prerelease version to v${newVersion}`);
	if (!dryRun) {
		writeRootVersion(newVersion);
	}
	process.exit(0);
}

if (!isBumpType(command)) {
	throw new Error(`Invalid bump type: ${command}`);
}

const bump = command;

const newVersion = computeNextVersion(rootPackage.version, bump);
appLogger.info(`${dryRun ? 'Would update' : 'Updating'} ${bump} version to v${newVersion}`);
if (!dryRun) {
	writeRootVersion(newVersion);
}
