/**
 * Suffixes that mark a file under the pages directory as an endpoint rather than a Page: `.api.`
 * followed by a script extension the server-module loader compiles.
 *
 * @remarks
 * Never a template extension: an endpoint has no Integration owner, Layout or Cache Strategy, so
 * config assembly rejects an Integration whose extensions end in one of these.
 */
export const ENDPOINT_FILE_EXTENSIONS: readonly string[] = ['.api.ts', '.api.tsx', '.api.js', '.api.jsx'];

/** Returns the endpoint marker `file` ends with, or `undefined` for any other file. */
export function findEndpointFileExtension(file: string): string | undefined {
	return ENDPOINT_FILE_EXTENSIONS.find((extension) => file.endsWith(extension));
}
