/** True when `error` is a filesystem miss (`ENOENT`). */
export function isEnoent(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
