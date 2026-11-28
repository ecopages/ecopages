import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';

const SCRIPT_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
/**
 * Subpaths that name a server, static, test or profiling build, such as `react-dom/server.browser` or
 * `react-dom/test-utils`.
 *
 * @remarks
 * A package lists these beside its browser entries, for the runtimes that use them, and a browser page does not.
 * They stay out of the surface and are served when an import asks. The conditions of an entry already leave out the
 * targets that resolve only under `node`, `react-server`, `worker`, `deno` or `bun`, since a browser build matches
 * none of them.
 */
const NON_BROWSER_SUBPATH = /^\.\/(?:.*\/)?(?:server|static|profiling|test-utils|testing|test)(?:[./-].*)?$/u;
const MODULE_FILE = /\.(?:[cm]?js)$/u;

/**
 * The most JavaScript files an installed package can hold and still be served as one file.
 *
 * @remarks
 * A package above it, such as an icon set, is served as one file for each module its importers reach, so a page does not
 * parse thousands of modules for the few it uses. The number comes from the measurements in the dev server page: up to
 * about 900 files the package file is a few files and builds in under a second, and at 3,349 files it is five
 * megabytes.
 */
export const VENDOR_PACKAGE_BUNDLE_MAX_MODULES = 1_000;

/** A package manifest, as far as the vendor graph reads it. */
type PackageManifest = { name?: unknown; exports?: unknown; sideEffects?: unknown };

function readManifest(directory: string): PackageManifest | undefined {
	const manifest = path.join(directory, 'package.json');
	if (!fileSystem.exists(manifest)) return undefined;
	try {
		const parsed: unknown = JSON.parse(fileSystem.readFileSync(manifest));
		return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The installed directory of the package that owns `file`: the nearest folder above it whose `package.json` has a name.
 *
 * @remarks
 * A folder inside a package can hold a `package.json` that only sets `type`, such as `dist/esm`, so a manifest
 * without a name does not end the search.
 */
export function findOwningPackageDir(file: string): string {
	let directory = path.dirname(file);
	while (true) {
		if (typeof readManifest(directory)?.name === 'string') return directory;
		const parent = path.dirname(directory);
		if (parent === directory) return path.dirname(file);
		directory = parent;
	}
}

/** Whether the package declares in `package.json` that importing its modules does something (`"sideEffects"` set and not `false`). */
export function declaresSideEffects(packageDir: string): boolean {
	const declared = readManifest(packageDir)?.sideEffects;
	return declared !== undefined && declared !== false;
}

function isInsidePackage(file: string, packageDir: string): boolean {
	return file === packageDir || file.startsWith(`${packageDir}/`);
}

/** The target of an exports entry under `conditions`, in the order the entry lists its conditions. */
function resolveExportTarget(target: unknown, conditions: ReadonlySet<string>): string | undefined {
	if (typeof target === 'string') return target;
	if (Array.isArray(target)) {
		for (const item of target) {
			const resolved = resolveExportTarget(item, conditions);
			if (resolved !== undefined) return resolved;
		}
		return undefined;
	}
	if (typeof target !== 'object' || target === null) return undefined;
	for (const [condition, value] of Object.entries(target)) {
		if (condition !== 'default' && !conditions.has(condition)) continue;
		const resolved = resolveExportTarget(value, conditions);
		if (resolved !== undefined) return resolved;
	}
	return undefined;
}

/** The entries of an exports field, keyed by subpath: a field of conditions or a string is the `.` subpath alone. */
function readExportSubpaths(exportsField: unknown): [string, unknown][] {
	if (typeof exportsField !== 'object' || exportsField === null || Array.isArray(exportsField)) {
		return exportsField === undefined ? [] : [['.', exportsField]];
	}
	const entries = Object.entries(exportsField);
	return entries.some(([key]) => key.startsWith('.')) ? entries : [['.', exportsField]];
}

function listFiles(directory: string, limit: number, found: string[] = []): string[] {
	if (found.length > limit) return found;
	let entries;
	try {
		entries = fileSystem.readdir(directory);
	} catch {
		return found;
	}
	for (const entry of entries) {
		if (entry.name === 'node_modules') continue;
		const full = path.join(directory, entry.name);
		if (entry.isDirectory) listFiles(full, limit, found);
		else found.push(full);
		if (found.length > limit) break;
	}
	return found;
}

/** The files a wildcard target such as `./dist/*.js` names, up to `limit + 1` of them, with what the first `*` matched. */
function expandPattern(packageDir: string, target: string, limit: number): { file: string; match: string }[] {
	const wildcard = target.indexOf('*');
	const base = path.resolve(packageDir, target.slice(0, wildcard).replace(/[^/]*$/u, ''));
	if (!isInsidePackage(base, packageDir)) return [];
	const escaped = target.replace(/^\.\//u, '').replace(/[.+?^${}()|[\]\\]/gu, '\\$&');
	const pattern = new RegExp(`^${escaped.replace('*', '(.*)').replaceAll('*', '.*')}$`, 'u');
	return listFiles(base, limit).flatMap((file) => {
		const match = pattern.exec(path.relative(packageDir, file));
		return match ? [{ file, match: match[1] ?? '' }] : [];
	});
}

/**
 * The script files in a package's `exports` field that a browser build under `conditions` reaches.
 *
 * @param limit - The most files to return; one more means the package has more.
 *
 * @remarks
 * A target that is not a script (a stylesheet, JSON, a manifest) or that is missing is left out, and so is one
 * outside the package. A package without an `exports` field has no surface; its entries are the files imported.
 */
export function resolvePackageSurface(packageDir: string, conditions: readonly string[], limit: number): string[] {
	const exportsField = readManifest(packageDir)?.exports;
	const active = new Set(conditions);
	const files = new Set<string>();
	const subpaths = readExportSubpaths(exportsField);
	const exact = new Set(subpaths.map(([subpath]) => subpath).filter((subpath) => !subpath.includes('*')));
	for (const [subpath, value] of subpaths) {
		if (NON_BROWSER_SUBPATH.test(subpath)) continue;
		const target = resolveExportTarget(value, active);
		if (target === undefined || !SCRIPT_FILE.test(target)) continue;
		const candidates = target.includes('*')
			? expandPattern(packageDir, target, limit)
					.map(({ file, match }) => ({ file, subpath: subpath.replace('*', match) }))
					.filter(
						(candidate) => !exact.has(candidate.subpath) && !NON_BROWSER_SUBPATH.test(candidate.subpath),
					)
					.map((candidate) => candidate.file)
			: [path.resolve(packageDir, target)];
		for (const candidate of candidates) {
			if (isInsidePackage(candidate, packageDir) && fileSystem.exists(candidate)) files.add(candidate);
		}
		if (files.size > limit) break;
	}
	return [...files];
}

/** The number of JavaScript files in a package, counted up to `limit + 1`. */
export function countPackageModules(packageDir: string, limit: number): number {
	let count = 0;
	const visit = (directory: string): void => {
		let entries;
		try {
			entries = fileSystem.readdir(directory);
		} catch {
			return;
		}
		for (const entry of entries) {
			if (count > limit) return;
			if (entry.name === 'node_modules') continue;
			const full = path.join(directory, entry.name);
			if (entry.isDirectory) visit(full);
			else if (MODULE_FILE.test(entry.name)) count += 1;
		}
	};
	visit(packageDir);
	return count;
}
