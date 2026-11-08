import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';

const READ_FILE_SYNC_PATTERN =
	/\bfs\.readFileSync\s*\(\s*path\.resolve\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)\s*,\s*['"`]utf-?8['"`]\s*\)/g;

function inferProjectRootFromSourcePath(filePath: string): string | undefined {
	const parts = filePath.split('/');
	const srcIndex = parts.lastIndexOf('src');
	if (srcIndex <= 0) return undefined;
	return parts.slice(0, srcIndex).join('/');
}

function resolveReadFileCandidate(relPath: string, sourcePath: string, absWorkingDir: string): string | undefined {
	const sourceDir = path.dirname(sourcePath);
	const inferredProjectRoot = inferProjectRootFromSourcePath(sourcePath);
	const candidates = [
		path.resolve(absWorkingDir, relPath),
		path.resolve(path.cwd(), relPath),
		path.resolve(sourceDir, relPath),
		...(inferredProjectRoot ? [path.resolve(inferredProjectRoot, relPath)] : []),
	];
	return candidates.find((candidate) => fileSystem.exists(candidate));
}

/**
 * Inlines `fs.readFileSync(path.resolve(...), 'utf8')` calls when the target file exists.
 *
 * @returns The rewritten source, whether it changed, and the files it inlined.
 */
export function inlineReadFileSyncCalls(
	source: string,
	sourcePath: string,
	absWorkingDir: string,
): { transformed: string; modified: boolean; inlinedFiles: string[] } {
	const inlinedFiles: string[] = [];
	if (!source.includes('readFileSync')) {
		return { transformed: source, modified: false, inlinedFiles };
	}

	let modified = false;
	const transformed = source.replace(READ_FILE_SYNC_PATTERN, (_match, _q, relPath) => {
		modified = true;
		try {
			const absolutePath = resolveReadFileCandidate(relPath, sourcePath, absWorkingDir);
			if (!absolutePath) return '""';
			inlinedFiles.push(absolutePath);
			return JSON.stringify(fileSystem.readFileSync(absolutePath));
		} catch {
			return '""';
		}
	});

	return { transformed, modified, inlinedFiles };
}
