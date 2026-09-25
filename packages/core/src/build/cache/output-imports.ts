import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { parseSync } from 'oxc-parser';

/**
 * Lists the local files a compiled module imports: relative, absolute and
 * `file:` specifiers in static imports, re-exports and literal dynamic imports.
 *
 * @remarks
 * Persisted build caches record these so a cached module is reused only while
 * the shared chunks and generated modules it loads (for example
 * `.server-collections`) still exist. Uses `parseSync` directly rather than the
 * shared parse cache, so large compiled bundles are not retained in memory.
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
 * Direct {@link collectLocalImports} misses shared chunks that a page output
 * only reaches through another chunk. Persisted caches walk this graph so reuse
 * fails when any reachable file is gone. `modulePath` itself is omitted; callers
 * already check that the compiled output exists.
 */
export function collectReachableLocalImports(
	modulePath: string,
	fileAccess: LocalImportFileAccess = defaultLocalImportFileAccess,
): string[] {
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

		for (const imported of collectLocalImports(fileAccess.readFile(current), current)) {
			pending.push(imported);
		}
	}

	return [...reachable];
}

/** Reads a compiled module from disk and lists its local imports. */
export function readLocalImports(modulePath: string): string[] {
	return collectLocalImports(fileSystem.readFileSync(modulePath), modulePath);
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
