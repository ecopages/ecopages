import { createHash } from 'node:crypto';
import type { CompileOptions } from '@mdx-js/mdx';

export type MdxTransformCacheEntry = {
	contents: string;
	loader?: 'js' | 'jsx';
	map?: unknown;
};

const transformCache = new Map<string, MdxTransformCacheEntry>();
const functionIdentities = new WeakMap<object, number>();
let compileInvocations = 0;
let nextFunctionIdentity = 1;

export function getMdxCompileInvocationCount(): number {
	return compileInvocations;
}

export function resetMdxTransformCacheForTests(): void {
	transformCache.clear();
	compileInvocations = 0;
}

function functionIdentityToken(value: object): string {
	let identity = functionIdentities.get(value);
	if (identity === undefined) {
		identity = nextFunctionIdentity;
		nextFunctionIdentity += 1;
		functionIdentities.set(value, identity);
	}

	return `__fn:${identity}`;
}

/**
 * Includes function-valued compiler plugins in the cache fingerprint.
 *
 * @remarks
 * `JSON.stringify` replaces functions in arrays with `null`, so two plugin
 * lists of the same length would collide. Function identity is used instead of
 * `Function#toString`, because plugins created by the same factory share a
 * source string even when their closures differ.
 */
function serializeMdxCompilerOptions(compilerOptions?: CompileOptions): string {
	return JSON.stringify(compilerOptions ?? {}, (_key, value) => {
		if (typeof value === 'function') {
			return functionIdentityToken(value);
		}

		return value;
	});
}

export function createMdxTransformCacheKey(filePath: string, source: string, compilerOptions?: CompileOptions): string {
	const sourceHash = createHash('sha256').update(source).digest('hex').slice(0, 16);
	const fingerprint = createHash('sha256')
		.update(serializeMdxCompilerOptions(compilerOptions))
		.digest('hex')
		.slice(0, 16);
	return `${filePath}::${sourceHash}::${fingerprint}`;
}

export function readMdxTransformCache(cacheKey: string): MdxTransformCacheEntry | undefined {
	return transformCache.get(cacheKey);
}

export function writeMdxTransformCache(cacheKey: string, entry: MdxTransformCacheEntry): void {
	transformCache.set(cacheKey, entry);
}

export function recordMdxCompileInvocation(): void {
	compileInvocations += 1;
}
