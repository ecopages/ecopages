import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

const READ_FILE_SYNC_PATTERN =
	/\bfs\.readFileSync\s*\(\s*path\.resolve\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)\s*,\s*['"`]utf-?8['"`]\s*\)/g;

function inferProjectRootFromSourcePath(filePath: string): string | undefined {
	const parts = filePath.split(/[\\/]/);
	const srcIndex = parts.lastIndexOf('src');
	if (srcIndex <= 0) return undefined;
	return parts.slice(0, srcIndex).join(sep);
}

function resolveReadFileCandidate(relPath: string, sourcePath: string, absWorkingDir: string): string | undefined {
	const sourceDir = dirname(sourcePath);
	const inferredProjectRoot = inferProjectRootFromSourcePath(sourcePath);
	const candidates = [
		resolve(absWorkingDir, relPath),
		resolve(process.cwd(), relPath),
		resolve(sourceDir, relPath),
		...(inferredProjectRoot ? [resolve(inferredProjectRoot, relPath)] : []),
	];
	return candidates.find((candidate) => existsSync(candidate));
}

/**
 * Inlines `fs.readFileSync(path.resolve(...), 'utf8')` calls when the target file exists.
 */
export function inlineReadFileSyncCalls(
	source: string,
	sourcePath: string,
	absWorkingDir: string,
): { transformed: string; modified: boolean; inlinedExternalFile: boolean } {
	if (!source.includes('readFileSync')) {
		return { transformed: source, modified: false, inlinedExternalFile: false };
	}

	let modified = false;
	let inlinedExternalFile = false;
	const transformed = source.replace(READ_FILE_SYNC_PATTERN, (_match, _q, relPath) => {
		modified = true;
		inlinedExternalFile = true;
		try {
			const absolutePath = resolveReadFileCandidate(relPath, sourcePath, absWorkingDir);
			if (!absolutePath) return '""';
			return JSON.stringify(readFileSync(absolutePath, 'utf-8'));
		} catch {
			return '""';
		}
	});

	return { transformed, modified, inlinedExternalFile };
}
