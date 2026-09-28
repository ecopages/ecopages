/**
 * Known static asset extensions served directly from disk.
 *
 * @remarks
 * Keep this list aligned with server static-file handling and client routers
 * that must bypass SPA navigation for same-origin asset links.
 */
export const STATIC_FILE_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'gif',
	'bmp',
	'svg',
	'tiff',
	'webp',
	'avif',
	'ico',
	'mp3',
	'ogg',
	'wav',
	'mp4',
	'webm',
	'ogv',
	'mov',
	'txt',
	'md',
	'html',
	'css',
	'js',
	'mjs',
	'json',
	'map',
	'xml',
	'webmanifest',
	'wasm',
	'csv',
	'ttf',
	'woff',
	'woff2',
	'otf',
	'eot',
	'gz',
	'zip',
	'pdf',
	'doc',
]);

/**
 * Returns whether a path or filename ends with a known static asset extension.
 */
export function hasKnownStaticExtension(fileOrPath: string): boolean {
	const extension = fileOrPath.split('.').pop();
	return extension !== undefined && STATIC_FILE_EXTENSIONS.has(extension);
}
