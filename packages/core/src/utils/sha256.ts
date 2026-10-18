import { createHash } from 'node:crypto';

export function sha256Hex(input: string | Buffer, length?: number): string {
	const digest = createHash('sha256').update(input).digest('hex');
	return length === undefined ? digest : digest.slice(0, length);
}
