/** FNV-1a 32-bit hash, so seeds derived from strings are stable across runtimes and releases. */
export function hashString(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}
