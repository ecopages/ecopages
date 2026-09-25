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
