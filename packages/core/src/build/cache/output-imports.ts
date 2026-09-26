import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { parseSync } from 'oxc-parser';

/**
 * Lists the local files a compiled module imports: relative, absolute and
 * `file:` specifiers in static imports, re-exports and literal dynamic imports.
 *
 * @remarks
 * {@link collectReachableLocalImports} follows these edges so persisted build
 * caches can check that the shared chunks and generated modules a cached module
 * loads (for example `.server-collections`) still exist. Uses `parseSync`
 * directly rather than the shared parse cache, so large compiled bundles are not
 * retained in memory.
 */
export function collectLocalImports(code: string, modulePath: string): string[] {
	const { module } = parseSync(modulePath, code, { lang: 'js', sourceType: 'module' });
	const specifiers = [
		...module.staticImports.map((entry) => entry.moduleRequest.value),
		...module.staticExports.flatMap((entry) =>
			entry.entries.map((exportEntry) => exportEntry.moduleRequest?.value),
		),
		...module.dynamicImports.map((entry) =>
			readStringLiteral(code.slice(entry.moduleRequest.start, entry.moduleRequest.end)),
		),
	];

	const directory = path.dirname(modulePath);
	const localImports = new Set<string>();
	for (const specifier of specifiers) {
		const resolved = specifier ? resolveLocalSpecifier(specifier, directory) : undefined;
		if (resolved) localImports.add(resolved);
	}
	return [...localImports];
}

export type LocalImportFileAccess = {
	exists: (filePath: string) => boolean;
	readFile: (filePath: string) => string;
};

const defaultLocalImportFileAccess: LocalImportFileAccess = {
	exists: (filePath) => fileSystem.exists(filePath),
	readFile: (filePath) => fileSystem.readFileSync(filePath),
};

/**
 * Lists every local file reachable from `modulePath` through local imports.
 *
 * @remarks
 * {@link collectLocalImports} alone misses shared chunks that a page output only
 * reaches through another chunk. Persisted caches record this full set and are
 * reused only while every file in it exists. `modulePath` itself is omitted,
 * because callers already check that the compiled output exists.
 *
 * A missing file is listed but not followed, so a cache recorded against it
 * never validates.
 *
 * Pass one `directImportsCache` to every walk of a single build so shared chunks
 * are read and parsed once instead of once per output.
 */
export function collectReachableLocalImports(
	modulePath: string,
	options: { fileAccess?: LocalImportFileAccess; directImportsCache?: Map<string, string[]> } = {},
): string[] {
	const { fileAccess = defaultLocalImportFileAccess, directImportsCache = new Map<string, string[]>() } = options;
	const reachable = new Set<string>();
	const pending = [modulePath];
	const visited = new Set<string>();

	while (pending.length > 0) {
		const current = pending.pop();
		if (!current || visited.has(current)) {
			continue;
		}
		visited.add(current);

		if (current !== modulePath) {
			reachable.add(current);
		}

		if (current !== modulePath && !fileAccess.exists(current)) {
			continue;
		}

		let directImports = directImportsCache.get(current);
		if (!directImports) {
			directImports = collectLocalImports(fileAccess.readFile(current), current);
			directImportsCache.set(current, directImports);
		}
		pending.push(...directImports);
	}

	return [...reachable];
}

function resolveLocalSpecifier(specifier: string, directory: string): string | undefined {
	const bare = specifier.replace(/[?#].*$/, '');
	if (bare.startsWith('file:')) return fileURLToPath(bare);
	if (bare.startsWith('.')) return path.resolve(directory, bare);
	return path.isAbsolute(bare) ? bare : undefined;
}

function readStringLiteral(source: string): string | undefined {
	return /^(['"`])([^'"`$]*)\1$/.exec(source.trim())?.[2];
}
