import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';

const HASH_LENGTH = 16;
export const HASHED_BROWSER_ASSET_INDEX_FILENAME = '.ecopages-hashed-assets';
const hashedBrowserAssetPaths = new Set<string>();
const loadedHashedBrowserAssetDirectories = new Set<string>();

/**
 * Returns a filesystem-safe hash of the bytes that will be served.
 */
export function hashBrowserAssetBytes(bytes: string | Buffer): string {
	return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_LENGTH);
}

/** Records a content-addressed output path in process memory and beside the emitted file. */
export function recordHashedBrowserAsset(filePath: string): void {
	const resolvedPath = path.resolve(filePath);
	const directory = path.dirname(resolvedPath);
	loadHashedBrowserAssetDirectory(directory);
	hashedBrowserAssetPaths.add(resolvedPath);
	if (!fileSystem.exists(resolvedPath)) return;

	const indexPath = path.join(directory, HASHED_BROWSER_ASSET_INDEX_FILENAME);
	const recordedNames = readHashedBrowserAssetIndex(indexPath);
	const filename = path.basename(resolvedPath);
	if (!recordedNames.includes(filename)) {
		fileSystem.write(indexPath, `${JSON.stringify([...recordedNames, filename].sort())}\n`);
	}
}

/** Returns whether the build pipeline recorded this path as content-addressed. */
export function isHashedBrowserAsset(filePath: string): boolean {
	const resolvedPath = path.resolve(filePath);
	if (path.basename(resolvedPath) === HASHED_BROWSER_ASSET_INDEX_FILENAME) return false;

	const directory = path.dirname(resolvedPath);
	loadHashedBrowserAssetDirectory(directory);
	return hashedBrowserAssetPaths.has(resolvedPath);
}

export function forgetHashedBrowserAsset(filePath: string): void {
	const resolvedPath = path.resolve(filePath);
	const directory = path.dirname(resolvedPath);
	loadHashedBrowserAssetDirectory(directory);
	hashedBrowserAssetPaths.delete(resolvedPath);
	const indexPath = path.join(directory, HASHED_BROWSER_ASSET_INDEX_FILENAME);
	if (!fileSystem.exists(indexPath)) return;

	const filename = path.basename(resolvedPath);
	const recordedNames = readHashedBrowserAssetIndex(indexPath).filter((name) => name !== filename);
	if (recordedNames.length === 0) {
		fileSystem.remove(indexPath);
		return;
	}
	fileSystem.write(indexPath, `${JSON.stringify(recordedNames)}\n`);
}

function readHashedBrowserAssetIndex(indexPath: string): string[] {
	if (!fileSystem.exists(indexPath)) return [];

	try {
		const parsed: unknown = JSON.parse(fileSystem.readFileSync(indexPath));
		return Array.isArray(parsed) && parsed.every((value): value is string => typeof value === 'string')
			? parsed
			: [];
	} catch {
		return [];
	}
}

function loadHashedBrowserAssetDirectory(directory: string): void {
	if (loadedHashedBrowserAssetDirectories.has(directory)) return;

	const indexPath = path.join(directory, HASHED_BROWSER_ASSET_INDEX_FILENAME);
	for (const filename of readHashedBrowserAssetIndex(indexPath)) {
		hashedBrowserAssetPaths.add(path.join(directory, filename));
	}
	loadedHashedBrowserAssetDirectories.add(directory);
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
	recordHashedBrowserAsset(filepath);
	return filepath;
}
