import { readFileSync } from 'node:fs';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import type { BuildOptions } from '../contracts/build-contracts.ts';

let cachedCorePackageVersion: string | undefined;

/**
 * Returns the installed `@ecopages/core` package version for cache invalidation.
 */
export function getCorePackageVersion(): string {
	if (cachedCorePackageVersion) {
		return cachedCorePackageVersion;
	}

	const packageJsonPath = new URL('../../../package.json', import.meta.url);
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
	cachedCorePackageVersion = packageJson.version ?? '0.0.0';
	return cachedCorePackageVersion;
}

/** Stable fingerprint for JSX options used in build and disk cache keys. */
export function createJsxCacheKey(jsx: BuildOptions['jsx']): string {
	if (!jsx) {
		return 'jsx:default';
	}

	return JSON.stringify({
		development: jsx.development ?? false,
		factory: jsx.factory ?? null,
		fragment: jsx.fragment ?? null,
		importSource: jsx.importSource ?? null,
		runtime: jsx.runtime ?? null,
		sideEffects: jsx.sideEffects ?? null,
	});
}

/** Stable fingerprint for ordered build plugins. */
export function createPluginCacheKey(plugins?: EcoBuildPlugin[]): string {
	if (!plugins || plugins.length === 0) {
		return 'plugins:default';
	}

	return `plugins:${plugins.map((plugin) => `${plugin.name}:${hashFunctionIdentity(plugin.setup)}`).join(',')}`;
}

/** Stable fingerprint for ordered source transforms. */
export function createSourceTransformCacheKey(sourceTransforms: BuildOptions['sourceTransforms']): string {
	if (!sourceTransforms || sourceTransforms.length === 0) {
		return 'sourceTransforms:default';
	}

	return `sourceTransforms:${sourceTransforms
		.map((transform) => {
			const filterSource = transform.filter.source;
			const filterFlags = transform.filter.flags;
			return [
				transform.name,
				transform.enforce ?? 'default',
				filterSource,
				filterFlags,
				hashFunctionIdentity(transform.transform),
			].join(':');
		})
		.join(',')}`;
}

/**
 * Stable fingerprint of a function body for cache and request identity keys.
 *
 * @remarks
 * Hashes `fn.toString()`. Suitable for in-process and persisted keys that must
 * agree within one install; not stable across minifiers or renames.
 */
export function hashFunctionIdentity(fn: (...args: never[]) => unknown): string {
	let hash = 0;
	const source = fn.toString();

	for (let index = 0; index < source.length; index += 1) {
		hash = (hash * 31 + source.charCodeAt(index)) | 0;
	}

	return (hash >>> 0).toString(36);
}

/** @deprecated Use {@link hashFunctionIdentity}. */
export const hashPluginSetup = hashFunctionIdentity;
