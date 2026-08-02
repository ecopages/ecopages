import { createHash } from 'node:crypto';
import type { CompileOptions } from '@mdx-js/mdx';

export type MdxTransformCacheEntry = {
	contents: string;
	loader: 'js' | 'jsx';
};

const transformCache = new Map<string, MdxTransformCacheEntry>();
let compileInvocations = 0;

export function getMdxCompileInvocationCount(): number {
	return compileInvocations;
}

export function resetMdxTransformCacheForTests(): void {
	transformCache.clear();
	compileInvocations = 0;
}

export function createMdxTransformCacheKey(filePath: string, source: string, compilerOptions?: CompileOptions): string {
	const sourceHash = createHash('sha256').update(source).digest('hex').slice(0, 16);
	const fingerprint = createHash('sha256')
		.update(JSON.stringify(compilerOptions ?? {}))
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
