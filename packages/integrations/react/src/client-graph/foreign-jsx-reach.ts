import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { parseModuleSource, resolveProjectModulePath } from '@ecopages/core/build';
import { compileSync } from '@mdx-js/mdx';
import { FOREIGN_STUB_SCHEME } from './foreign-module.ts';

const MDX_SOURCE = /\.mdx?$/;
const SCANNED_SOURCE = /\.(?:[cm]?[jt]sx?|mdx?)$/;

export type ForeignJsxReachOptions = {
	projectRoot: string;
	/** React entry files: island and Page modules. */
	reactEntryFiles: ReadonlySet<string>;
	/** Every other entry file of the build. */
	otherEntryFiles: Iterable<string>;
	isForeignFile: (filePath: string) => boolean;
	/**
	 * The source of a module as React's graph compiles it, or `undefined` to keep it; applied on the walks from
	 * React entry files only.
	 *
	 * @remarks
	 * React's rewrite points an import of a foreign file's static Components at the file's stub module, which this
	 * walk does not follow, so a walk that read the original source would count that file and its imports as reached
	 * by React.
	 */
	reactModuleSource?: (filePath: string, source: string) => string | undefined;
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

/**
 * Reads the module specifiers of a file from its parsed module: static imports, `export ... from` and dynamic
 * `import()` with a literal specifier.
 *
 * @remarks
 * The parser does not read MDX, so an MDX file is compiled first and its output parsed. A file that does not read,
 * compile or parse has no specifiers.
 */
function readImportSpecifiers(
	filePath: string,
	moduleSource?: (filePath: string, source: string) => string | undefined,
): string[] {
	try {
		let source = fileSystem.readFileSync(filePath);
		let parsePath = filePath;
		if (MDX_SOURCE.test(filePath)) {
			source = String(compileSync(source, { format: filePath.endsWith('.md') ? 'md' : 'mdx' }));
			parsePath = `${filePath}.jsx`;
		}
		source = moduleSource?.(filePath, source) ?? source;
		const { module } = parseModuleSource(parsePath, source);
		return [
			...module.staticImports.map((entry) => entry.moduleRequest.value),
			...module.staticExports.flatMap((entry) => entry.entries.map((exported) => exported.moduleRequest?.value)),
			...module.dynamicImports.map((entry) => literalSpecifier(source, entry.moduleRequest)),
		].filter((specifier): specifier is string => typeof specifier === 'string');
	} catch {
		return [];
	}
}

/** The specifier of a dynamic `import()` when its argument is a plain string literal, otherwise `undefined`. */
function literalSpecifier(source: string, span: { start: number; end: number }): string | undefined {
	const text = source.slice(span.start, span.end);
	const quote = text[0];
	if ((quote !== "'" && quote !== '"') || text.at(-1) !== quote) return undefined;
	return text.slice(1, -1);
}

/**
 * Resolves a specifier to a local file: a relative or tsconfig path import of the app's own files, or an absolute
 * file path that exists.
 *
 * @remarks
 * Core's grouped content-script entries import each script by its absolute path, so without the absolute case a
 * script reached only through such an entry would be absent from the scan.
 */
export function resolveLocalModulePath(projectRoot: string, fromFile: string, specifier: string): string | undefined {
	const filePath = specifier.replace(/[?#].*$/, '');
	if (path.isAbsolute(filePath)) return fileSystem.exists(filePath) ? filePath : undefined;
	return resolveProjectModulePath(projectRoot, fromFile, specifier, { preserveBarrel: true });
}

/**
 * Walks the static imports of the app's own source files from `roots`, never into a file in `stopAt`, and
 * returns each foreign file it reaches with the root that reached it first.
 */
function collectForeignFiles(
	roots: Iterable<string>,
	stopAt: ReadonlySet<string>,
	options: ForeignJsxReachOptions,
	moduleSource?: (filePath: string, source: string) => string | undefined,
): Map<string, string> {
	const foreign = new Map<string, string>();
	const visited = new Set<string>();
	const pending = [...roots].map((root) => [root, root] as const);
	while (pending.length > 0) {
		const [filePath, root] = pending.pop()!;
		if (visited.has(filePath)) continue;
		visited.add(filePath);
		for (const specifier of readImportSpecifiers(filePath, moduleSource)) {
			if (specifier.startsWith(FOREIGN_STUB_SCHEME)) continue;
			const resolved = resolveLocalModulePath(options.projectRoot, filePath, specifier);
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
 * It runs before any module loads, so the answer does not depend on load order. Only relative, tsconfig path
 * and absolute path imports of the app's own files are followed; packages are never scanned. A walk from another entry stops at a
 * React entry file, since React's bootstrap entries import their Page or island module.
 */
export function scanForeignJsxReach(options: ForeignJsxReachOptions): ForeignJsxReach {
	return {
		react: new Set(
			collectForeignFiles(options.reactEntryFiles, new Set(), options, options.reactModuleSource).keys(),
		),
		others: collectForeignFiles(options.otherEntryFiles, options.reactEntryFiles, options),
	};
}
