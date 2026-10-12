import { createHash } from 'node:crypto';

export const RUNTIME_ERRORS = {
	BUN_RUNTIME_REQUIRED: 'Bun runtime is required',
} as const;

type RuntimeBun = typeof Bun;

export function getBunRuntime(): RuntimeBun | undefined {
	return (globalThis as { Bun?: RuntimeBun }).Bun;
}

export function getRequiredBunRuntime(): RuntimeBun {
	const bun = getBunRuntime();

	if (!bun) {
		throw new Error(RUNTIME_ERRORS.BUN_RUNTIME_REQUIRED);
	}

	return bun;
}

export function getRuntimeArgv(): string[] {
	return process.argv;
}

export function isDevelopmentRuntime(): boolean {
	return process.env.NODE_ENV === 'development';
}

export function isProductionRuntime(): boolean {
	return process.env.NODE_ENV === 'production';
}

/**
 * Hashes content with the Node SHA-256 prefix.
 *
 * @remarks
 * The first 16 hex characters of SHA-256 are one algorithm on every runtime.
 * Bun used to call `Bun.hash`, which made component ids differ for the same path.
 */
export function runtimeHash(content: string | Buffer<ArrayBufferLike>): bigint {
	const hex = createHash('sha256').update(content).digest('hex').slice(0, 16);
	return BigInt(`0x${hex}`);
}
