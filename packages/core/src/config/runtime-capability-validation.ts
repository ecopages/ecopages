import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { RuntimeCapabilityDeclaration, RuntimeCapabilityTag } from '../plugins/runtime-capability.ts';

type RuntimeKind = 'node' | 'bun';

type ContributorKind = 'integration' | 'processor';

type RuntimeEnvironment = {
	runtime: RuntimeKind;
	version: string;
	supportedTags: Set<RuntimeCapabilityTag>;
};

type RuntimeCapabilityOwner = {
	kind: ContributorKind;
	name: string;
	runtimeCapability?: RuntimeCapabilityDeclaration;
};

const UNSUPPORTED_TAG_REASONS: Record<RuntimeCapabilityTag, string> = {
	'bun-only': 'it is Bun-only',
	'requires-native-bun-api': 'it requires the native Bun API',
	'requires-node-builtins': 'it requires Node builtins',
	'node-compatible': 'it requires a Node-compatible runtime',
};

function detectRuntimeEnvironment(): RuntimeEnvironment {
	const bunVersion = (globalThis as typeof globalThis & { Bun?: { version?: string } }).Bun?.version;
	if (typeof bunVersion === 'string') {
		return {
			runtime: 'bun',
			version: bunVersion,
			supportedTags: new Set<RuntimeCapabilityTag>([
				'bun-only',
				'node-compatible',
				'requires-native-bun-api',
				'requires-node-builtins',
			]),
		};
	}

	return {
		runtime: 'node',
		version: process.versions.node,
		supportedTags: new Set<RuntimeCapabilityTag>(['node-compatible', 'requires-node-builtins']),
	};
}

function parseVersion(version: string): number[] | undefined {
	const normalized = version.trim().replace(/^v/i, '');
	if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
		return undefined;
	}

	return normalized.split('.').map((segment) => Number(segment));
}

function compareVersions(left: number[], right: number[]): number {
	const maxLength = Math.max(left.length, right.length);
	for (let index = 0; index < maxLength; index += 1) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0);
		if (difference !== 0) {
			return Math.sign(difference);
		}
	}

	return 0;
}

function validateRuntimeCapability(contributor: RuntimeCapabilityOwner, environment: RuntimeEnvironment): void {
	const declaration = contributor.runtimeCapability;
	if (!declaration) {
		return;
	}

	const label = `${contributor.kind} "${contributor.name}"`;
	const unsupportedTag = declaration.tags.find((tag) => !environment.supportedTags.has(tag));
	if (unsupportedTag) {
		throw new Error(`Cannot enable ${label} on ${environment.runtime}: ${UNSUPPORTED_TAG_REASONS[unsupportedTag]}`);
	}

	if (!declaration.minRuntimeVersion) {
		return;
	}

	const minVersion = parseVersion(declaration.minRuntimeVersion);
	if (!minVersion) {
		throw new Error(
			`Cannot validate ${label} runtimeCapability.minRuntimeVersion "${declaration.minRuntimeVersion}" because it is not a dot-separated numeric version`,
		);
	}

	const currentVersion = parseVersion(environment.version);
	if (currentVersion && compareVersions(currentVersion, minVersion) < 0) {
		throw new Error(
			`Cannot enable ${label} on ${environment.runtime} ${environment.version}: requires runtime version ${declaration.minRuntimeVersion} or newer`,
		);
	}
}

/**
 * Rejects Integrations and Processors whose `runtimeCapability` the current runtime cannot meet.
 *
 * @remarks
 * Runs during config finalization, before any `setup()`, so an incompatible plugin fails
 * startup instead of failing at first render. A runtime version that is not numeric (a
 * prerelease build, for example) skips the minimum-version check.
 *
 * @throws When a declared tag is unsupported, `minRuntimeVersion` is not a dot-separated
 * number, or the runtime is older than `minRuntimeVersion`.
 */
export function validateRuntimeCapabilities(config: EcoPagesAppConfig): void {
	const environment = detectRuntimeEnvironment();
	const contributors: RuntimeCapabilityOwner[] = [
		...config.integrations.map(({ name, runtimeCapability }) => ({
			kind: 'integration' as const,
			name,
			runtimeCapability,
		})),
		...Array.from(config.processors.values(), ({ name, runtimeCapability }) => ({
			kind: 'processor' as const,
			name,
			runtimeCapability,
		})),
	];

	for (const contributor of contributors) {
		validateRuntimeCapability(contributor, environment);
	}
}
