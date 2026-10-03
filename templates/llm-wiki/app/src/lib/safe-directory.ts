import path from 'node:path';

/**
 * Resolves `dirPath` when it does not collapse through `.` or `..` and is not
 * the filesystem root.
 *
 * @remarks
 * `path.join(parent, '.')` is `parent`, and `path.join(parent, '..')` is its
 * parent. Callers must refuse those before using the path as a directory they
 * might replace.
 */
export function assertDirectoryTarget(dirPath: string): string {
	const segments = dirPath.split(/[/\\]/);
	if (dirPath.trim().length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
		throw new Error(`Refusing directory target ${JSON.stringify(dirPath)}`);
	}

	const resolved = path.resolve(dirPath);
	if (resolved === path.parse(resolved).root) {
		throw new Error(`Refusing filesystem root as a directory target: ${dirPath}`);
	}

	return resolved;
}

/**
 * Resolves one child directory inside `parentPath`.
 *
 * @remarks
 * The child must be a single name. `.` and `..` are rejected before `path.join`,
 * which would otherwise turn them into the parent directory or its parent.
 */
export function resolveChildDirectory(parentPath: string, childName: string): string {
	if (
		childName.length === 0 ||
		childName === '.' ||
		childName === '..' ||
		childName.includes('/') ||
		childName.includes('\\') ||
		childName.includes('\0')
	) {
		throw new Error(`Refusing directory name ${JSON.stringify(childName)}`);
	}

	const parent = assertDirectoryTarget(parentPath);
	const child = path.resolve(parent, childName);
	const relative = path.relative(parent, child);
	if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`Refusing directory target ${child}`);
	}

	return child;
}
