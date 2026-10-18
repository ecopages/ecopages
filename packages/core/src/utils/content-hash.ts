import { createHash } from 'node:crypto';

const SHA256_HEX_LENGTH = 64;

/**
 * Returns a stable SHA-256 content digest, optionally shortened to a hex prefix.
 *
 * @param input - Text or bytes to hash.
 * @param length - Number of leading hexadecimal characters to return. Defaults to the full digest.
 * @returns The SHA-256 digest as lowercase hexadecimal.
 */
export function contentHash(input: string | Buffer, length?: number): string {
	if (length !== undefined && (!Number.isInteger(length) || length < 1 || length > SHA256_HEX_LENGTH)) {
		throw new RangeError(`contentHash length must be an integer from 1 to ${SHA256_HEX_LENGTH}`);
	}

	const digest = createHash('sha256').update(input).digest('hex');
	return length === undefined ? digest : digest.slice(0, length);
}
