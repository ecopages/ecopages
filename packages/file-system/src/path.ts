/**
 * @module @ecopages/file-system/path
 * @description The one path convention of Ecopages, and the path operations that keep it.
 *
 * Every path Ecopages holds uses forward slashes. An absolute path keeps its Windows drive letter as the source
 * spelled it (`D:/app/src/page.tsx`); on POSIX it is the usual `/app/src/page.tsx`. Every operation here returns
 * a path in that form, so paths split on `/` and become URLs or cache keys without a separator check. Containment
 * goes through {@link PathApi.isWithin}, which also matches a drive letter spelled in the other case.
 *
 * Node's file system APIs accept forward slashes on Windows, so a path in this form goes to `fileSystem`, `import()`
 * (through {@link PathApi.toFileUrl}) and most child processes unchanged. A path that Node or a tool hands back in
 * native form enters through {@link PathApi.fromNative} or {@link PathApi.fromFileUrl}, at the boundary where it
 * arrives: config directories, watcher events, glob and readdir results, `import.meta`, and module resolution.
 *
 * @example
 * ```typescript
 * import { path } from '@ecopages/file-system/path';
 *
 * const srcDir = path.resolve(rootDir, 'src');
 * const here = path.fromFileUrl(import.meta.url);
 * await import(path.toFileUrl(outputFile).href);
 * ```
 */

import nodePath from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The parts of a path returned by {@link PathApi.parse}. */
export type ParsedPath = nodePath.ParsedPath;

/** Path operations that take paths in any separator style and return them with forward slashes. */
export interface PathApi {
	/** Always `/`, the separator of every path this API returns. */
	readonly sep: '/';
	/** The separator of entries in `PATH`-like variables on the host: `;` on Windows, `:` elsewhere. */
	readonly delimiter: string;
	join(...segments: string[]): string;
	resolve(...segments: string[]): string;
	/**
	 * @remarks
	 * On Windows a path on another drive has no relative form, so the result is that path, absolute. Check
	 * {@link PathApi.isAbsolute} on the result before treating it as a path below `from`.
	 */
	relative(from: string, to: string): string;
	dirname(filePath: string): string;
	basename(filePath: string, suffix?: string): string;
	extname(filePath: string): string;
	isAbsolute(filePath: string): boolean;
	normalize(filePath: string): string;
	parse(filePath: string): ParsedPath;
	format(parsed: Partial<ParsedPath>): string;
	matchesGlob(filePath: string, pattern: string): boolean;
	/** The working directory of the process, in this form. */
	cwd(): string;
	/** Whether `filePath` is `directory` or sits below it. */
	isWithin(directory: string, filePath: string): boolean;
	/** Converts a path Node or a tool returned in the host's native form. */
	fromNative(filePath: string): string;
	/**
	 * Converts a path to the host's native form.
	 *
	 * @remarks
	 * Only for a consumer that does not accept forward slashes on Windows, such as a command line read by a
	 * Windows program. Node's own APIs do not need it.
	 */
	toNative(filePath: string): string;
	/** Converts a `file:` URL, such as `import.meta.url` or a resolver's result, to a path. */
	fromFileUrl(url: string | URL): string;
	/** Converts an absolute path to a `file:` URL, the form `import()` needs for a path on Windows. */
	toFileUrl(filePath: string): URL;
}

/**
 * @remarks
 * The drive letter keeps the case it arrived with. Node's ESM loader keys modules by URL and does not normalise
 * drive case, so a module Node first loaded from a lower-case drive URL (a process started from a lower-case cwd) would
 * load a second time from an upper-cased one. `relative` and `isWithin` compare drives without regard
 * to case, as `node:path` does on Windows.
 */
function fromWindowsPath(filePath: string): string {
	return filePath.replaceAll('\\', '/');
}

/**
 * Creates the path operations for one host flavor.
 *
 * @remarks
 * Call sites use {@link path}, created for the current host. Passing `'win32'` gives the Windows behaviour on any
 * host, so tests can check it without a Windows machine.
 */
export function createPath(flavor: 'posix' | 'win32' = process.platform === 'win32' ? 'win32' : 'posix'): PathApi {
	const native = flavor === 'win32' ? nodePath.win32 : nodePath.posix;
	const windows = flavor === 'win32';
	const fromNative = windows ? fromWindowsPath : (filePath: string) => filePath;

	const api: PathApi = {
		sep: '/',
		delimiter: native.delimiter,
		join: (...segments) => fromNative(native.join(...segments)),
		resolve: (...segments) => fromNative(native.resolve(...segments)),
		relative: (from, to) => fromNative(native.relative(from, to)),
		dirname: (filePath) => fromNative(native.dirname(filePath)),
		basename: (filePath, suffix) => native.basename(filePath, suffix),
		extname: (filePath) => native.extname(filePath),
		isAbsolute: (filePath) => native.isAbsolute(filePath),
		normalize: (filePath) => fromNative(native.normalize(filePath)),
		parse: (filePath) => {
			const parsed = native.parse(filePath);
			return { ...parsed, root: fromNative(parsed.root), dir: fromNative(parsed.dir) };
		},
		format: (parsed) => fromNative(native.format(parsed)),
		matchesGlob: (filePath, pattern) => native.matchesGlob(filePath, pattern),
		cwd: () => fromNative(process.cwd()),
		isWithin: (directory, filePath) => {
			const relativePath = api.relative(directory, filePath);
			return (
				relativePath === '' ||
				(!relativePath.startsWith('../') && relativePath !== '..' && !native.isAbsolute(relativePath))
			);
		},
		fromNative,
		toNative: windows ? (filePath) => filePath.replaceAll('/', '\\') : (filePath) => filePath,
		fromFileUrl: (url) => fromNative(fileURLToPath(url, { windows })),
		toFileUrl: (filePath) => pathToFileURL(filePath, { windows }),
	};
	return api;
}

/** The path operations for the current host. */
export const path: PathApi = createPath();
