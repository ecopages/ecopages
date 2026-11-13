import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { resolveProjectModulePath } from '@ecopages/core/build';

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\1/g;
const SCANNED_SOURCE = /\.(?:[cm]?[jt]sx?|mdx?)$/;

export type ForeignJsxReachOptions = {
	projectRoot: string;
	/** React entry files: island and Page modules. */
	reactEntryFiles: ReadonlySet<string>;
	/** Every other entry file of the build. */
	otherEntryFiles: Iterable<string>;
	isForeignFile: (filePath: string) => boolean;
};

export type ForeignJsxReach = {
	/** Foreign files a React entry file reaches. */
	react: ReadonlySet<string>;
	/** Foreign files another entry reaches without passing a React entry file, each with that entry. */
	others: ReadonlyMap<string, string>;
};

/** `filePath` with symbolic links resolved, so paths from the build and from the scan compare equal. */
export function toRealPath(filePath: string): string {
	try {
		return fileSystem.realpath(filePath);
	} catch {
		return path.resolve(filePath);
	}
}

function readImportSpecifiers(filePath: string): string[] {
	let source: string;
	try {
		source = fileSystem.readFileSync(filePath);
	} catch {
		return [];
	}
	return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[2]!);
}

/**
 * Walks the static imports of the app's own source files from `roots`, never into a file in `stopAt`, and
 * returns each foreign file it reaches with the root that reached it first.
 *
 * @remarks
 * A root that is itself a foreign file counts as reaching itself, so a standalone script entry another
 * Integration owns stays with its owner instead of falling through as a file the scan did not find.
 */
function collectForeignFiles(
	roots: Iterable<string>,
	stopAt: ReadonlySet<string>,
	options: ForeignJsxReachOptions,
): Map<string, string> {
	const foreign = new Map<string, string>();
	const visited = new Set<string>();
	const pending = [...roots].map((root) => [root, root] as const);
	for (const [root] of pending) {
		if (options.isForeignFile(root)) foreign.set(root, root);
	}
	while (pending.length > 0) {
		const [filePath, root] = pending.pop()!;
		if (visited.has(filePath)) continue;
		visited.add(filePath);
		for (const specifier of readImportSpecifiers(filePath)) {
			const resolved = resolveProjectModulePath(options.projectRoot, filePath, specifier, {
				preserveBarrel: true,
			});
			if (!resolved || resolved.split('/').includes('node_modules')) continue;
			const target = toRealPath(resolved);
			if (stopAt.has(target)) continue;
			if (options.isForeignFile(target) && !foreign.has(target)) foreign.set(target, root);
			if (SCANNED_SOURCE.test(target)) pending.push([target, root]);
		}
	}
	return foreign;
}

/**
 * Finds which foreign JSX files React entry files reach and which other entries reach, from static imports.
 *
 * @remarks
 * It runs before any module loads, so the answer does not depend on load order. Only relative and tsconfig path
 * imports of the app's own files are followed; packages are never scanned. A walk from another entry stops at a
 * React entry file, since React's bootstrap entries import their Page or island module.
 */
export function scanForeignJsxReach(options: ForeignJsxReachOptions): ForeignJsxReach {
	return {
		react: new Set(collectForeignFiles(options.reactEntryFiles, new Set(), options).keys()),
		others: collectForeignFiles(options.otherEntryFiles, options.reactEntryFiles, options),
	};
}
