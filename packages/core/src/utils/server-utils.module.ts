const ContentTypeMap = new Map<string, string>([
	['jpg', 'image/jpeg'],
	['jpeg', 'image/jpeg'],
	['png', 'image/png'],
	['gif', 'image/gif'],
	['bmp', 'image/bmp'],
	['svg', 'image/svg+xml'],
	['tiff', 'image/tiff'],
	['webp', 'image/webp'],
	['avif', 'image/avif'],
	['ico', 'image/x-icon'],
	['mp3', 'audio/mpeg'],
	['ogg', 'audio/ogg'],
	['wav', 'audio/wav'],
	['mp4', 'video/mp4'],
	['webm', 'video/webm'],
	['ogv', 'video/ogg'],
	['mov', 'video/quicktime'],
	['txt', 'text/plain'],
	['html', 'text/html'],
	['css', 'text/css'],
	['js', 'text/javascript'],
	['mjs', 'text/javascript'],
	['json', 'application/json'],
	['map', 'application/json'],
	['xml', 'application/xml'],
	['webmanifest', 'application/manifest+json'],
	['wasm', 'application/wasm'],
	['csv', 'text/csv'],
	['ttf', 'font/ttf'],
	['woff', 'font/woff'],
	['woff2', 'font/woff2'],
	['otf', 'font/otf'],
	['eot', 'application/vnd.ms-fontobject'],
	['gz', 'application/x-gzip'],
	['zip', 'application/zip'],
	['pdf', 'application/pdf'],
	['doc', 'application/msword'],
]);

/**
 * Get the content type of a file based on its extension.
 * @param file - The file name.
 * @returns The content type.
 */
export const getContentType = (file: string): string => {
	const extension = file.split('.').pop() || 'txt';
	return ContentTypeMap.get(extension) || 'text/plain';
};

/**
 * Check if a file path has a known static file extension.
 * @param file - The file name or path.
 * @returns true if the extension is recognized.
 */
export const hasKnownExtension = (file: string): boolean => {
	const extension = file.split('.').pop();
	return extension !== undefined && ContentTypeMap.has(extension);
};

/**
 * A module for server utilities.
 */
export const ServerUtils = {
	getContentType,
	hasKnownExtension,
};
