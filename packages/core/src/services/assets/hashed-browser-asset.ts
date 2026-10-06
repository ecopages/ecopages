import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';

const HASH_LENGTH = 16;

/**
 * Returns a filesystem-safe hash of the bytes that will be served.
 */
export function hashBrowserAssetBytes(bytes: string | Buffer): string {
	return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_LENGTH);
}

function normalizeExtension(extension: string): string {
	return extension.startsWith('.') ? extension : `.${extension}`;
}

/**
 * Writes a production browser asset under a name derived from a hash of its
 * final bytes, and returns that path.
 *
 * @remarks
 * The same bytes always produce the same name, so an unchanged stylesheet keeps
 * its URL and a quality or source change gets a new URL. Development keeps
 * source-relative names so CSS HMR can refresh the same href. Vendor runtimes
 * keep their own stable names and must not go through this helper.
 */
export function writeHashedBrowserAsset(options: {
	bytes: string | Buffer;
	directory: string;
	extension: string;
}): string {
	const buffer = typeof options.bytes === 'string' ? Buffer.from(options.bytes) : options.bytes;
	const filename = `${hashBrowserAssetBytes(buffer)}${normalizeExtension(options.extension)}`;
	const filepath = path.join(options.directory, filename);
	fileSystem.ensureDir(options.directory);
	if (!fileSystem.exists(filepath)) {
		fileSystem.write(filepath, buffer);
	}
	return filepath;
}
