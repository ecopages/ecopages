import { fileSystem } from '@ecopages/file-system';
import { rebaseStylesheetReferences } from '@ecopages/core/processor';
import { createRequire } from 'node:module';
import { path } from '@ecopages/file-system/path';
import postcss from 'postcss';
import postcssImportDefault from 'postcss-import';
import type postcssImport from 'postcss-import';
import resolveImportIdDefault from './postcss-import-resolve-id.js';

type PostcssImportOptions = NonNullable<Parameters<typeof postcssImport>[0]>;
type ResolveImportId = (id: string, base: string, options: PostcssImportOptions, node: unknown) => Promise<string>;
type PackageJson = {
	style?: string;
	main?: string;
	exports?: Record<string, string | { style?: string; import?: string; require?: string; default?: string }>;
};

/**
 * Finds the nearest directory containing a package.json by walking up from a file path.
 * Falls back to `process.cwd()` when no package.json is found.
 */
export function resolveAppRootFromPath(filePath: string): string {
	let dir = path.dirname(path.resolve(filePath));
	const filesystemRoot = path.parse(dir).root;

	while (dir !== filesystemRoot) {
		if (fileSystem.exists(path.join(dir, 'package.json'))) {
			return dir;
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}

	return path.cwd();
}

function loadPostcssImport(requireFromApp: NodeRequire): typeof postcssImportDefault {
	try {
		return requireFromApp('postcss-import') as typeof postcssImportDefault;
	} catch {
		return postcssImportDefault;
	}
}

/**
 * @remarks
 * The fallback is imported statically: a server bundle that inlines this module keeps the import, where a
 * `require` relative to this module would resolve from the bundle's folder.
 */
function loadResolveImportId(requireFromApp: NodeRequire): ResolveImportId {
	try {
		return requireFromApp('postcss-import/lib/resolve-id') as ResolveImportId;
	} catch {
		return resolveImportIdDefault;
	}
}

function splitPackageSpecifier(id: string): { packageName: string; subpath: string } {
	if (id.startsWith('@')) {
		const [scope, name, ...rest] = id.split('/');
		return {
			packageName: `${scope}/${name}`,
			subpath: rest.join('/'),
		};
	}

	const [packageName, ...rest] = id.split('/');
	return { packageName, subpath: rest.join('/') };
}

function resolveExportTarget(pkg: PackageJson, packageDir: string, subpath: string): string | null {
	const exports = pkg.exports;
	if (!exports) {
		return null;
	}

	const keys = [`./${subpath}`, `./${subpath.replace(/\.css$/, '')}`];
	for (const key of keys) {
		const entry = exports[key];
		if (!entry) {
			continue;
		}

		const target =
			typeof entry === 'string' ? entry : (entry.style ?? entry.import ?? entry.require ?? entry.default);
		if (!target) {
			continue;
		}

		const resolved = path.join(packageDir, target);
		if (fileSystem.exists(resolved)) {
			return resolved;
		}
	}

	return null;
}

function findPackageDirFromNodeModules(packageName: string, appRoot: string): string | null {
	let dir = path.resolve(appRoot);
	const filesystemRoot = path.parse(dir).root;

	while (true) {
		const candidate = path.join(dir, 'node_modules', packageName, 'package.json');
		if (fileSystem.exists(candidate)) {
			return path.dirname(candidate);
		}

		if (dir === filesystemRoot) {
			break;
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}

	return null;
}

function resolveBarePackageImport(id: string, appRoot: string): string {
	const { packageName, subpath } = splitPackageSpecifier(id);
	const packageDir = findPackageDirFromNodeModules(packageName, appRoot);
	if (!packageDir) {
		throw new Error(`Unable to locate package "${packageName}" from "${appRoot}"`);
	}
	const packageJsonPath = path.join(packageDir, 'package.json');
	const pkg = JSON.parse(fileSystem.readFileSync(packageJsonPath)) as PackageJson;

	if (subpath) {
		const directPath = path.join(packageDir, subpath);
		if (fileSystem.exists(directPath)) {
			return directPath;
		}

		const exportPath = resolveExportTarget(pkg, packageDir, subpath);
		if (exportPath) {
			return exportPath;
		}

		throw new Error(`Unable to resolve "${id}"`);
	}

	if (pkg.style) {
		const stylePath = path.join(packageDir, pkg.style);
		if (fileSystem.exists(stylePath)) {
			return stylePath;
		}
	}

	const indexCssPath = path.join(packageDir, 'index.css');
	if (fileSystem.exists(indexCssPath)) {
		return indexCssPath;
	}

	if (pkg.main && /\.css$/.test(pkg.main)) {
		const mainPath = path.join(packageDir, pkg.main);
		if (fileSystem.exists(mainPath)) {
			return mainPath;
		}
	}

	throw new Error(`Unable to resolve CSS entry for package "${id}"`);
}

/**
 * Rebases the relative `url()` references of the declarations postcss-import inlined from other files, so they
 * resolve from the importing stylesheet as they did from their own file.
 *
 * @remarks
 * Core resolves a processed stylesheet's relative references from its source file's real directory and emits the
 * files they name; without this, `url(files/font.woff2)` from `@import '@fontsource/inter'` would resolve beside
 * the app's file. Core's {@link rebaseStylesheetReferences} does the rewrite with its stylesheet tokenizer; core
 * decides which referenced files it copies.
 */
function rebaseInlinedUrls(): postcss.Plugin {
	return {
		postcssPlugin: 'ecopages-rebase-inlined-urls',
		Once(root) {
			const entry = root.source?.input.file;
			if (!entry) return;
			root.walkDecls((decl) => {
				const file = decl.source?.input.file;
				if (!file || file === entry || !/url\(|image-set\(/i.test(decl.value)) return;
				decl.value = rebaseStylesheetReferences(decl.value, file, entry);
			});
		},
	};
}

const IMPORT_SPECIFIER = /^\s*(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s)'"]+))/i;
const REMOTE_SPECIFIER = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** The partial an `@import` at-rule names, or `undefined` for a remote, `data:` or unparsable one. */
function importSpecifier(node: postcss.AtRule): string | undefined {
	const match = IMPORT_SPECIFIER.exec(node.params);
	const specifier = match?.[1] ?? match?.[2] ?? match?.[3];
	return specifier && !REMOTE_SPECIFIER.test(specifier) ? specifier : undefined;
}

/** The `@import`s of each stylesheet that must not be inlined, by their offset in the file's source. */
type DroppedImports = Map<string, Set<number>>;

/**
 * Finds the `@import`s, in the entry stylesheet and the partials it reaches, of a stylesheet that a later
 * `@import` imports again.
 *
 * @remarks
 * `postcss-import` inlines a stylesheet where it is first imported, but the cascade orders it at its last
 * import, as core and Lightning CSS do. Walking the imports in the order they inline, the last occurrence of each
 * resolved file is the one kept. An `@import` that closes a cycle is not an occurrence, since `postcss-import` skips it. An `@import` that does not resolve is left to `postcss-import`, which reports it.
 */
async function findEarlierDuplicateImports(
	entry: postcss.Root,
	entryFile: string,
	resolve: ResolveImportId,
	options: PostcssImportOptions,
): Promise<DroppedImports> {
	const occurrences: { file: string; offset: number; target: string }[] = [];

	const visit = async (root: postcss.Root, file: string, ancestors: string[]): Promise<void> => {
		for (const node of root.nodes) {
			if (node.type !== 'atrule' || node.name.toLowerCase() !== 'import') continue;
			const specifier = importSpecifier(node);
			const offset = node.source?.start?.offset;
			if (!specifier || offset === undefined) continue;

			let target: string;
			try {
				target = await resolve(specifier, path.dirname(file), options, node);
			} catch {
				continue;
			}
			if (ancestors.includes(target)) continue;
			occurrences.push({ file, offset, target });
			if (!fileSystem.exists(target)) continue;
			try {
				const partial = postcss.parse(await fileSystem.readFile(target), { from: target });
				await visit(partial, target, [...ancestors, target]);
			} catch {
				continue;
			}
		}
	};

	await visit(entry, entryFile, [entryFile]);

	const last = new Map<string, number>();
	occurrences.forEach(({ target }, index) => last.set(target, index));
	const dropped: DroppedImports = new Map();
	occurrences.forEach(({ file, offset, target }, index) => {
		if (last.get(target) === index) return;
		const offsets = dropped.get(file) ?? new Set<number>();
		offsets.add(offset);
		dropped.set(file, offsets);
	});
	return dropped;
}

function dropImports(root: postcss.Root, offsets: Set<number>): void {
	root.each((node) => {
		if (
			node.type === 'atrule' &&
			node.source?.start?.offset !== undefined &&
			offsets.has(node.source.start.offset)
		) {
			node.remove();
		}
	});
}

/**
 * Creates a postcss-import step that resolves bare package imports from the app root, orders a stylesheet imported
 * twice at its last import as the cascade does, and rebases the relative `url()` references of the files it
 * inlines onto the importing stylesheet.
 *
 * @remarks
 * Every run builds its own `postcss-import` instance, since which imports it drops depends on the stylesheet.
 */
export function createAppAwarePostcssImport(appRoot: string): postcss.AcceptedPlugin {
	const requireFromApp = createRequire(path.join(appRoot, 'package.json'));
	const postcssImport = loadPostcssImport(requireFromApp);
	const resolveImportId = loadResolveImportId(requireFromApp);

	const resolve: ResolveImportId = (id, base, options, node) => {
		return resolveImportId(id, base, options, node).catch((error: unknown) => {
			if (id.startsWith('.') || path.isAbsolute(id)) {
				throw error;
			}

			try {
				return resolveBarePackageImport(id, appRoot);
			} catch {
				throw error;
			}
		});
	};
	const importOptions: PostcssImportOptions = {
		root: appRoot,
		path: [],
		addModulesDirectories: [],
		resolve: resolve as unknown as NonNullable<PostcssImportOptions['resolve']>,
	};

	return {
		postcssPlugin: 'ecopages-postcss-import',
		async Once(root, { result }) {
			const entryFile = root.source?.input.file;
			const dropped = entryFile
				? await findEarlierDuplicateImports(root, entryFile, resolve, importOptions)
				: new Map<string, Set<number>>();
			const entryDrops = entryFile ? dropped.get(entryFile) : undefined;
			if (entryDrops) dropImports(root, entryDrops);

			const inner = await postcss([
				postcssImport({
					...importOptions,
					load: async (filename: string) => {
						const css = await fileSystem.readFile(filename);
						const offsets = dropped.get(filename);
						if (!offsets) return css;
						const partial = postcss.parse(css, { from: filename });
						dropImports(partial, offsets);
						return partial.toString();
					},
				}),
				rebaseInlinedUrls(),
			]).process(root, { from: entryFile });
			result.messages.push(...inner.messages);
		},
	};
}
