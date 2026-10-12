import { createHash } from 'node:crypto';

export type ProcessRuntime = {
	name: 'bun' | 'node';
	version: string;
};

/**
 * Names the JavaScript runtime running this process and its version.
 *
 * @remarks
 * Reads `process.versions.bun`, which Bun sets through its Node API support, so
 * no Bun global or Bun types are needed. Use it to report the runtime, never to branch: every runtime takes the same path.
 */
export function getProcessRuntime(): ProcessRuntime {
	const bunVersion = process.versions.bun;
	return bunVersion ? { name: 'bun', version: bunVersion } : { name: 'node', version: process.versions.node };
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
 * Bun used to hash with its native hash, which made component ids differ for the same path.
 */
export function runtimeHash(content: string | Buffer<ArrayBufferLike>): bigint {
	const hex = createHash('sha256').update(content).digest('hex').slice(0, 16);
	return BigInt(`0x${hex}`);
}
