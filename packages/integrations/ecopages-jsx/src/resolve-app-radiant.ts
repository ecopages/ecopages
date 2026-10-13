import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADIANT_PACKAGE = '@ecopages/radiant';

/**
 * Resolves a `@ecopages/radiant` subpath from the application, then from this integration.
 *
 * @remarks
 * `import.meta.resolve` starts beside this package. A workspace can keep an older Radiant
 * there while the app depends on a newer one. Server render and the client hydrator have
 * to use the copy that defined the app's elements.
 */
export function resolveAppRadiantModule(subpath: string, fromDirectory = process.cwd()): string {
	const specifier = subpath === '.' ? RADIANT_PACKAGE : `${RADIANT_PACKAGE}/${subpath}`;
	const fromApp = resolveFromDirectory(subpath, fromDirectory);
	if (fromApp) {
		return fromApp;
	}

	return fileURLToPath(import.meta.resolve(specifier));
}

function resolveFromDirectory(subpath: string, fromDirectory: string): string | undefined {
	const packageDir = findPackageDir(path.resolve(fromDirectory));
	if (!packageDir) {
		return undefined;
	}

	const target = readExportTarget(packageDir, subpath);
	return target ? path.join(packageDir, target) : undefined;
}

function findPackageDir(startDir: string): string | undefined {
	let dir = startDir;
	while (true) {
		const candidate = path.join(dir, 'node_modules', RADIANT_PACKAGE, 'package.json');
		if (existsSync(candidate)) {
			return path.dirname(candidate);
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
}

function readExportTarget(packageDir: string, subpath: string): string | undefined {
	const manifest = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as {
		exports?: Record<string, unknown>;
	};
	const key = subpath === '.' ? '.' : `./${subpath}`;
	return exportTarget(manifest.exports?.[key]);
}

function exportTarget(entry: unknown): string | undefined {
	if (typeof entry === 'string') {
		return entry;
	}

	if (typeof entry !== 'object' || entry === null) {
		return undefined;
	}

	const record = entry as { import?: unknown; default?: unknown };
	if (typeof record.import === 'string') {
		return record.import;
	}

	if (typeof record.default === 'string') {
		return record.default;
	}

	return undefined;
}
