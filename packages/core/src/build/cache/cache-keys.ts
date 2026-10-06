import { readFileSync } from 'node:fs';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import type { BuildOptions } from '../contracts/build-contracts.ts';
import { resolveTransformHandlerIdentity } from '../../plugins/source-transform.ts';

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

/** Stable fingerprint for ordered build plugins, including each plugin's `transform`. */
export function createPluginCacheKey(plugins?: EcoBuildPlugin[]): string {
	if (!plugins || plugins.length === 0) {
		return 'plugins:default';
	}

	return `plugins:${plugins
		.map(({ name, setup, transform }) =>
			[
				name,
				hashFunctionIdentity(setup),
				...(transform
					? [
							transform.order ?? 'default',
							transform.filter.source,
							transform.filter.flags,
							hashFunctionIdentity(resolveTransformHandlerIdentity(transform.handler)),
						]
					: []),
			].join(':'),
		)
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
