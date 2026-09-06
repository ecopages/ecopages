import path from 'node:path';
import { parseArgs } from 'node:util';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import ts from 'typescript';
import {
	findPublishablePackageDirs,
	readJsonFile,
	rewriteWorkspaceRanges,
	toPosix,
	type WorkspaceDependencyManifest,
} from './package-utils.ts';

type PackageManifest = WorkspaceDependencyManifest & {
	private?: boolean;
	files?: string[];
	main?: string;
	module?: string;
	types?: string;
	exports?: unknown;
	scripts?: Record<string, string>;
	peerDependenciesMeta?: Record<string, unknown>;
	overrides?: Record<string, string>;
	publishConfig?: Record<string, unknown>;
	[key: string]: unknown;
};

const repoRoot = path.resolve(import.meta.dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');
const sharedNpmTsconfigPath = path.join(repoRoot, 'tsconfig.npm.json');

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);
const tsSourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const supportedManifestFields = ['main', 'module'] as const;
const runtimeExportConditionPriority = ['default', 'import', 'browser', 'node', 'deno', 'bun', 'worker'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isExportSubpathKey(key: string): boolean {
	return key === '.' || key.startsWith('./');
}

function isConditionalExportObject(value: Record<string, unknown>): boolean {
	const keys = Object.keys(value);
	return keys.length > 0 && keys.every((key) => !isExportSubpathKey(key));
}

function collectManifestPaths(value: unknown, output: Set<string>): void {
	if (typeof value === 'string') {
		output.add(value);
		return;
	}

	if (!value || typeof value !== 'object') {
		return;
	}

	for (const nestedValue of Object.values(value as Record<string, unknown>)) {
		collectManifestPaths(nestedValue, output);
	}
}

function isTestLike(relativePath: string): boolean {
	return (
		relativePath.includes('/__fixtures__/') ||
		relativePath.includes('/__screenshots__/') ||
		relativePath.includes('/test/') ||
		relativePath.includes('/__tests__/') ||
		/\.(test|spec)\.[^.]+$/i.test(relativePath)
	);
}

function shouldSkipDirectory(name: string): boolean {
	return (
		name === 'node_modules' ||
		name === 'dist' ||
		name === '__fixtures__' ||
		name === '__screenshots__' ||
		name === 'test' ||
		name === '__tests__'
	);
}

/**
 * Collects the package-relative entry points that define the publishable surface.
 *
 * The build only walks files reachable from manifest-declared roots instead of the
 * entire package directory, which keeps test helpers and local tooling out of `dist`
 * unless they are explicitly exported.
 */
function collectPackageRoots(packageDir: string, manifest: PackageManifest): string[] {
	const roots = new Set<string>();

	for (const fileEntry of manifest.files ?? []) {
		roots.add(fileEntry);
	}

	for (const field of supportedManifestFields) {
		if (typeof manifest[field] === 'string') {
			roots.add(manifest[field]);
		}
	}

	if (typeof manifest.types === 'string') {
		roots.add(manifest.types);
	}

	collectManifestPaths(manifest.exports, roots);

	return Array.from(roots)
		.map((entry) => path.resolve(packageDir, entry))
		.filter((entry) => existsSync(entry));
}

/**
 * Scans the manifest roots and partitions files by how the build pipeline should
 * handle them.
 *
 * Code files are transpiled, declaration files are emitted or copied with rewritten
 * specifiers, and everything else is treated as a static asset. Test-like paths are
 * excluded even if they sit under an exported directory.
 */
function scanPackageFiles(
	packageDir: string,
	roots: string[],
): {
	codeFiles: string[];
	declarationFiles: string[];
	assetFiles: string[];
} {
	const codeFiles = new Set<string>();
	const declarationFiles = new Set<string>();
	const assetFiles = new Set<string>();

	const visit = (absolutePath: string): void => {
		const stats = statSync(absolutePath);
		if (stats.isDirectory()) {
			if (shouldSkipDirectory(path.basename(absolutePath))) {
				return;
			}

			for (const entry of readdirSync(absolutePath)) {
				visit(path.join(absolutePath, entry));
			}
			return;
		}

		const relativePath = toPosix(path.relative(packageDir, absolutePath));
		if (isTestLike(relativePath)) {
			return;
		}

		if (relativePath.endsWith('.d.ts')) {
			declarationFiles.add(absolutePath);
			return;
		}

		if (sourceExtensions.has(path.extname(absolutePath))) {
			codeFiles.add(absolutePath);
			return;
		}

		assetFiles.add(absolutePath);
	};

	for (const root of roots) {
		visit(root);
	}

	return {
		codeFiles: Array.from(codeFiles).sort(),
		declarationFiles: Array.from(declarationFiles).sort(),
		assetFiles: Array.from(assetFiles).sort(),
	};
}

/**
 * Rewrites relative import specifiers so emitted files point at runtime extensions
 * instead of source extensions.
 *
 * The build emits `.js`, `.mjs`, and `.cjs` files, so leaving `.ts`-style specifiers
 * behind would make the published package fail at runtime.
 */
function rewriteRelativeSpecifiers(content: string): string {
	return content.replace(
		/(["'])((?:\.{1,2}\/)[^"'\n\r]+?)\.(cts|mts|tsx|ts|jsx)(\1)/g,
		(_match, quote, specifier, extension, closingQuote) => {
			const nextExtension = extension === 'mts' ? 'mjs' : extension === 'cts' ? 'cjs' : 'js';
			return `${quote}${specifier}.${nextExtension}${closingQuote}`;
		},
	);
}

function rewriteManifestRuntimePath(value: string): string {
	if (value.endsWith('.d.ts')) {
		return value;
	}

	if (value.endsWith('.mts')) {
		return `${value.slice(0, -4)}.mjs`;
	}

	if (value.endsWith('.cts')) {
		return `${value.slice(0, -4)}.cjs`;
	}

	if (/\.(ts|tsx|js|jsx)$/.test(value)) {
		return value.replace(/\.(ts|tsx|js|jsx)$/u, '.js');
	}

	return value;
}

function rewriteManifestTypesPath(value: string): string {
	if (value.endsWith('.d.ts')) {
		return value;
	}

	if (/\.(mts|cts|ts|tsx|js|jsx)$/.test(value)) {
		return value.replace(/\.(mts|cts|ts|tsx|js|jsx)$/u, '.d.ts');
	}

	return value;
}

/**
 * Removes unsupported export conditions and rewrites manifest paths to the emitted
 * runtime or declaration files.
 *
 * In particular, CommonJS `require` targets are dropped because this build emits an
 * ESM-only runtime surface for npm packages.
 */
function rewriteExportMap(value: unknown): unknown {
	if (typeof value === 'string') {
		return rewriteManifestRuntimePath(value);
	}

	if (!isRecord(value)) {
		return value;
	}

	const rewritten: Record<string, unknown> = {};
	for (const [key, nestedValue] of Object.entries(value)) {
		if (key === 'require') {
			continue;
		}

		if (key === 'types' && typeof nestedValue === 'string') {
			rewritten[key] = rewriteManifestTypesPath(nestedValue);
			continue;
		}

		rewritten[key] = rewriteExportMap(nestedValue);
	}

	if (!('default' in rewritten) && typeof rewritten.import === 'string') {
		rewritten.default = rewritten.import;
	}

	return rewritten;
}

function getTypesPathForRuntimePath(value: string): string {
	return rewriteManifestTypesPath(value);
}

function findRuntimeExportPath(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value;
	}

	if (!isRecord(value)) {
		return undefined;
	}

	for (const key of runtimeExportConditionPriority) {
		const nestedValue = value[key];
		const runtimePath = findRuntimeExportPath(nestedValue);
		if (runtimePath) {
			return runtimePath;
		}
	}

	for (const nestedValue of Object.values(value)) {
		const runtimePath = findRuntimeExportPath(nestedValue);
		if (runtimePath) {
			return runtimePath;
		}
	}

	return undefined;
}

/**
 * Normalizes export entries into a shape that always carries a runtime target and,
 * when possible, a declaration target.
 *
 * String exports are promoted into `{ types, default }` objects, conditional exports
 * are rewritten recursively, and missing `types` metadata is inferred from the first
 * runtime path that would be selected by consumers.
 */
function normalizeExportTarget(value: unknown): unknown {
	if (typeof value === 'string') {
		const runtimePath = rewriteManifestRuntimePath(value);
		return {
			types: getTypesPathForRuntimePath(value),
			default: runtimePath,
		};
	}

	if (!isRecord(value)) {
		return value;
	}

	if (!isConditionalExportObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, nestedValue]) => [key, normalizeExportTarget(nestedValue)]),
		);
	}

	const normalized: Record<string, unknown> = {};
	for (const [key, nestedValue] of Object.entries(value)) {
		if (key === 'types' && typeof nestedValue === 'string') {
			normalized[key] = rewriteManifestTypesPath(nestedValue);
			continue;
		}

		if (typeof nestedValue === 'string') {
			normalized[key] = rewriteManifestRuntimePath(nestedValue);
			continue;
		}

		normalized[key] = normalizeExportTarget(nestedValue);
	}

	if (!('default' in normalized) && typeof normalized.import === 'string') {
		normalized.default = normalized.import;
	}

	if (!('types' in normalized)) {
		const runtimePath = findRuntimeExportPath(normalized);
		if (runtimePath) {
			normalized.types = getTypesPathForRuntimePath(runtimePath);
		}
	}

	return normalized;
}

function getRootExportTypesPath(exportsField: unknown): string | undefined {
	if (!isRecord(exportsField)) {
		return undefined;
	}

	if (isConditionalExportObject(exportsField)) {
		return typeof exportsField.types === 'string' ? exportsField.types : undefined;
	}

	const rootExport = exportsField['.'];
	if (!isRecord(rootExport)) {
		return undefined;
	}

	return typeof rootExport.types === 'string' ? rootExport.types : undefined;
}

function createTsExtensionExportAliases(exportsField: unknown): Record<string, unknown> {
	if (!isRecord(exportsField)) {
		return {};
	}

	const aliases: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(exportsField)) {
		if (key === '.' || key.endsWith('.ts')) {
			continue;
		}

		aliases[`${key}.ts`] = value;
	}

	return aliases;
}

/**
 * Verifies that a manifest path points at an emitted file inside `dist` and that its
 * extension matches the expected runtime or declaration category.
 */
function ensureManifestPathExists(distDir: string, value: string, label: string, expectTypes: boolean): void {
	if (!value.startsWith('./')) {
		throw new Error(`Invalid ${label} path "${value}". Expected a relative dist path starting with "./".`);
	}

	if (expectTypes) {
		if (!value.endsWith('.d.ts')) {
			throw new Error(`Invalid ${label} path "${value}". Expected a declaration file ending in ".d.ts".`);
		}
	} else if (/\.(cts|mts|tsx|ts|jsx)$/u.test(value)) {
		throw new Error(
			`Invalid ${label} path "${value}". Runtime manifest entries must not point to source TypeScript files.`,
		);
	}

	const absolutePath = path.join(distDir, value);
	if (!existsSync(absolutePath)) {
		throw new Error(`Missing ${label} target "${value}" in ${toPosix(path.relative(repoRoot, distDir))}.`);
	}
}

/**
 * Recursively validates a single export entry and reports whether it exposes runtime
 * code, declaration files, or both.
 *
 * The caller uses this to enforce the invariant that every published runtime entry has
 * accompanying type metadata.
 */
function inspectConditionalExportEntry(
	entry: unknown,
	distDir: string,
	label: string,
): { hasRuntime: boolean; hasTypes: boolean } {
	if (typeof entry === 'string') {
		ensureManifestPathExists(distDir, entry, label, false);
		return { hasRuntime: true, hasTypes: false };
	}

	if (!isRecord(entry)) {
		throw new Error(`Invalid export entry for ${label}. Expected a string or condition map.`);
	}

	let hasRuntime = false;
	let hasTypes = false;

	for (const [condition, nestedValue] of Object.entries(entry)) {
		if (condition === 'types') {
			if (typeof nestedValue !== 'string') {
				throw new Error(`Invalid types condition for ${label}. Expected a string path.`);
			}

			ensureManifestPathExists(distDir, nestedValue, `${label}#types`, true);
			hasTypes = true;
			continue;
		}

		const nestedResult = inspectConditionalExportEntry(nestedValue, distDir, `${label}#${condition}`);
		hasRuntime ||= nestedResult.hasRuntime;
		hasTypes ||= nestedResult.hasTypes;
	}

	return { hasRuntime, hasTypes };
}

/**
 * Validates the final `dist/package.json` against the files that were actually emitted.
 *
 * This is the last safety check before writing the manifest, and it is intentionally
 * strict so packaging mistakes fail during the build instead of after publishing.
 */
function validateDistManifest(distManifest: PackageManifest, distDir: string): void {
	for (const field of supportedManifestFields) {
		if (typeof distManifest[field] === 'string') {
			ensureManifestPathExists(distDir, distManifest[field] as string, field, false);
		}
	}

	if (typeof distManifest.types === 'string') {
		ensureManifestPathExists(distDir, distManifest.types, 'types', true);
	}

	if (distManifest.exports === undefined) {
		return;
	}

	if (typeof distManifest.exports === 'string') {
		const result = inspectConditionalExportEntry(distManifest.exports, distDir, 'exports[.]');
		if (result.hasRuntime && !result.hasTypes) {
			throw new Error('Missing types metadata for exports[.].');
		}
		return;
	}

	if (!isRecord(distManifest.exports)) {
		throw new Error('Invalid exports field. Expected a string or export map object.');
	}

	if (isConditionalExportObject(distManifest.exports)) {
		const result = inspectConditionalExportEntry(distManifest.exports, distDir, 'exports[.]');
		if (result.hasRuntime && !result.hasTypes) {
			throw new Error('Missing types metadata for exports[.].');
		}
		return;
	}

	for (const [exportKey, exportValue] of Object.entries(distManifest.exports)) {
		const result = inspectConditionalExportEntry(exportValue, distDir, `exports[${exportKey}]`);
		if (result.hasRuntime && !result.hasTypes) {
			throw new Error(`Missing types metadata for exports[${exportKey}].`);
		}
	}
}

function ensureDir(filePath: string): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeTextFile(filePath: string, content: string): void {
	ensureDir(filePath);
	writeFileSync(filePath, content, 'utf-8');
}

function copyFileToDist(sourceFile: string, packageDir: string, distDir: string, transformContent = false): void {
	const relativePath = path.relative(packageDir, sourceFile);
	const destination = path.join(distDir, relativePath);
	ensureDir(destination);

	if (!transformContent) {
		copyFileSync(sourceFile, destination);
		return;
	}

	const content = readFileSync(sourceFile, 'utf-8');
	writeFileSync(destination, rewriteRelativeSpecifiers(content), 'utf-8');
}

function loadJsonConfig(filePath: string): ts.ParsedCommandLine {
	const configFile = ts.readConfigFile(filePath, ts.sys.readFile);
	if (configFile.error) {
		throw new Error(ts.formatDiagnosticsWithColorAndContext([configFile.error], formatHost));
	}

	return ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(filePath), undefined, filePath);
}

const formatHost: ts.FormatDiagnosticsHost = {
	getCanonicalFileName: (fileName) => fileName,
	getCurrentDirectory: () => repoRoot,
	getNewLine: () => '\n',
};

/**
 * Emits `.d.ts` files for TypeScript sources and rewrites their relative specifiers to
 * match the runtime filenames produced by the JavaScript build.
 *
 * Package-local tsconfig settings are merged with the shared npm publishing config so
 * published declaration output stays consistent across packages.
 */
function emitDeclarations(packageDir: string, codeFiles: string[], declarationFiles: string[], distDir: string): void {
	const packageTsconfigPath = path.join(packageDir, 'tsconfig.json');
	const packageConfig = existsSync(packageTsconfigPath)
		? loadJsonConfig(packageTsconfigPath)
		: ts.parseJsonConfigFileContent({}, ts.sys, packageDir);
	const sharedConfig = loadJsonConfig(sharedNpmTsconfigPath);

	const declarationRootNames = [
		...codeFiles.filter((filePath) => tsSourceExtensions.has(path.extname(filePath))),
		...declarationFiles,
	];
	if (declarationRootNames.length === 0) {
		return;
	}

	const { types: _sharedTypes, ...sharedOptions } = sharedConfig.options;

	const compilerOptions: ts.CompilerOptions = {
		...packageConfig.options,
		...sharedOptions,
		rootDir: packageDir,
		outDir: distDir,
		declarationDir: undefined,
		noEmit: false,
		emitDeclarationOnly: true,
		declaration: true,
		declarationMap: false,
		sourceMap: false,
		incremental: false,
		tsBuildInfoFile: undefined,
		typeRoots: [
			path.join(packageDir, 'node_modules/@types'),
			path.join(repoRoot, 'node_modules/@types'),
		],
	};

	/**
	 * Shared npm tsconfig extends the repo-root config, which sets `types: ["node"]`.
	 * `createProgram` also resolves `@types` from `cwd` (the repo root), so Bun types
	 * installed on a package would be ignored without `typeRoots` above.
	 */
	delete compilerOptions.types;

	const program = ts.createProgram({
		rootNames: declarationRootNames,
		options: compilerOptions,
	});

	const diagnostics = ts.getPreEmitDiagnostics(program);
	const emitResult = program.emit();
	const allDiagnostics = diagnostics.concat(emitResult.diagnostics);

	if (allDiagnostics.length > 0) {
		throw new Error(ts.formatDiagnosticsWithColorAndContext(allDiagnostics, formatHost));
	}

	const rewriteDeclarationsInDir = (dirPath: string): void => {
		for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
			const fullPath = path.join(dirPath, entry.name);
			if (entry.isDirectory()) {
				rewriteDeclarationsInDir(fullPath);
				continue;
			}

			if (!entry.name.endsWith('.d.ts')) {
				continue;
			}

			const content = readFileSync(fullPath, 'utf-8');
			writeFileSync(fullPath, rewriteRelativeSpecifiers(content), 'utf-8');
		}
	};

	rewriteDeclarationsInDir(distDir);
}

/**
 * Transpiles source files one-by-one with TypeScript and writes the emitted runtime files
 * into `dist` using publishable extensions.
 *
 * This intentionally does not bundle modules. The published package preserves its file
 * structure, and relative imports are rewritten afterward so the emitted graph remains
 * internally consistent.
 */
async function buildJavaScript(packageDir: string, codeFiles: string[], distDir: string): Promise<void> {
	const packageTsconfigPath = path.join(packageDir, 'tsconfig.json');
	const packageConfig = existsSync(packageTsconfigPath)
		? loadJsonConfig(packageTsconfigPath)
		: ts.parseJsonConfigFileContent({}, ts.sys, packageDir);
	const sharedConfig = loadJsonConfig(sharedNpmTsconfigPath);
	const compilerOptions: ts.CompilerOptions = {
		...packageConfig.options,
		...sharedConfig.options,
		module: ts.ModuleKind.ESNext,
		target: ts.ScriptTarget.ES2022,
	};

	for (const sourceFile of codeFiles) {
		const extension = path.extname(sourceFile);
		const relativePath = path.relative(packageDir, sourceFile);
		const outputRelativePath = relativePath.replace(
			/\.(mts|cts|tsx|ts|jsx|js)$/u,
			(_match, fileExtension: string) => {
				if (fileExtension === 'mts') return '.mjs';
				if (fileExtension === 'cts') return '.cjs';
				return '.js';
			},
		);
		const outputPath = path.join(distDir, outputRelativePath);
		const source = readFileSync(sourceFile, 'utf-8');
		const transpiled =
			extension === '.js' || extension === '.mjs' || extension === '.cjs'
				? source
				: transpileJavaScriptSource(sourceFile, source, compilerOptions);

		const output = rewriteRelativeSpecifiers(transpiled);
		writeTextFile(outputPath, output);

		if (extension === '.cts') {
			continue;
		}
	}
}

function transpileJavaScriptSource(sourceFile: string, source: string, compilerOptions: ts.CompilerOptions): string {
	const result = ts.transpileModule(source, {
		compilerOptions,
		fileName: sourceFile,
	});

	if (result.diagnostics.length > 0) {
		throw new Error(
			`Failed to transpile ${sourceFile}:\n${ts.formatDiagnosticsWithColorAndContext(result.diagnostics, formatHost)}`,
		);
	}

	return result.outputText;
}

/**
 * Produces the publishable manifest for `dist` by rewriting source paths, normalizing
 * export metadata, and removing development-only fields.
 *
 * @remarks
 * `workspace:*` ranges are rewritten to `version`. Public packages share one version
 * through the changesets `fixed` group, so the consuming package version is the
 * dependency version.
 */
export function createDistManifest(manifest: PackageManifest, version: string): PackageManifest {
	const rewrittenExports = normalizeExportTarget(rewriteExportMap(manifest.exports));
	const distManifest: PackageManifest = {
		...manifest,
		version,
		dependencies: rewriteWorkspaceRanges(manifest.dependencies, version),
		peerDependencies: rewriteWorkspaceRanges(manifest.peerDependencies, version),
		optionalDependencies: rewriteWorkspaceRanges(manifest.optionalDependencies, version),
		devDependencies: rewriteWorkspaceRanges(manifest.devDependencies, version),
		exports:
			rewrittenExports && typeof rewrittenExports === 'object' && !Array.isArray(rewrittenExports)
				? {
						...(rewrittenExports as Record<string, unknown>),
						...createTsExtensionExportAliases(rewrittenExports),
					}
				: rewrittenExports,
	};

	for (const field of supportedManifestFields) {
		if (typeof distManifest[field] === 'string') {
			distManifest[field] = rewriteManifestRuntimePath(distManifest[field] as string);
		}
	}

	if (typeof distManifest.types === 'string') {
		distManifest.types = rewriteManifestTypesPath(distManifest.types);
	}

	if (typeof distManifest.types !== 'string') {
		const inferredTypesPath = getRootExportTypesPath(distManifest.exports);
		if (inferredTypesPath) {
			distManifest.types = inferredTypesPath;
		}
	}

	delete distManifest.private;
	delete distManifest.scripts;
	delete distManifest.devDependencies;
	delete distManifest.files;

	const publishConfig = toPublishablePublishConfig(distManifest.publishConfig);
	if (publishConfig) {
		distManifest.publishConfig = publishConfig;
	} else {
		delete distManifest.publishConfig;
	}

	return distManifest;
}

/**
 * Drops `publishConfig.directory` from the dist manifest.
 *
 * @remarks
 * Source packages point Changesets/pnpm at `dist`. Once we are already writing
 * `dist/package.json`, keeping `directory: "dist"` would publish `dist/dist`.
 */
function toPublishablePublishConfig(publishConfig: unknown): Record<string, unknown> | undefined {
	if (!isRecord(publishConfig)) {
		return undefined;
	}

	const { directory: _directory, ...rest } = publishConfig;
	return Object.keys(rest).length > 0 ? rest : undefined;
}

function copyMetadataFiles(packageDir: string, distDir: string): void {
	for (const fileName of ['README.md', 'LICENSE']) {
		const sourcePath = path.join(packageDir, fileName);
		if (!existsSync(sourcePath)) {
			continue;
		}

		copyFileSync(sourcePath, path.join(distDir, fileName));
	}
}

function matchesRequestedPackage(packageDir: string, manifest: PackageManifest, filters: Set<string>): boolean {
	if (filters.size === 0) {
		return true;
	}

	const relativeDir = toPosix(path.relative(repoRoot, packageDir));
	return filters.has(manifest.name) || filters.has(relativeDir) || filters.has(path.basename(packageDir));
}

/**
 * Builds a single publishable package directory into its `dist` folder.
 *
 * The pipeline is deliberately staged: emit runtime files, emit declarations, copy
 * untouched assets, then validate and write the final manifest. Keeping those steps
 * separate makes packaging failures easier to diagnose without changing publish output.
 */
async function buildPackage(packageDir: string): Promise<void> {
	const packageJsonPath = path.join(packageDir, 'package.json');
	const manifest = readJsonFile<PackageManifest>(packageJsonPath);

	if (!manifest.version) {
		throw new Error(`Missing version in ${packageJsonPath}`);
	}

	const roots = collectPackageRoots(packageDir, manifest);
	const { codeFiles, declarationFiles, assetFiles } = scanPackageFiles(packageDir, roots);
	const distDir = path.join(packageDir, 'dist');

	console.log(`Building ${manifest.name} (${codeFiles.length} files)...`);

	rmSync(distDir, { recursive: true, force: true });
	mkdirSync(distDir, { recursive: true });

	await buildJavaScript(packageDir, codeFiles, distDir);
	emitDeclarations(packageDir, codeFiles, declarationFiles, distDir);

	for (const filePath of declarationFiles) {
		copyFileToDist(filePath, packageDir, distDir, true);
	}

	for (const filePath of assetFiles) {
		copyFileToDist(filePath, packageDir, distDir);
	}

	copyMetadataFiles(packageDir, distDir);

	const distManifest = createDistManifest(manifest, manifest.version);
	validateDistManifest(distManifest, distDir);
	writeTextFile(path.join(distDir, 'package.json'), `${JSON.stringify(distManifest, null, 2)}\n`);

	console.log(`Built ${manifest.name} -> ${toPosix(path.relative(repoRoot, distDir))}`);
}

/**
 * Adds `publishConfig.directory` to a source package so `changeset publish` ships `dist`.
 *
 * @remarks
 * Committed manifests omit `directory` so pnpm workspace installs keep linking to
 * TypeScript sources. The Publish workflow passes `--stamp-publish-directory` after
 * compilation so npm still publishes the compiled folder.
 */
function stampPublishDirectory(packageDir: string): void {
	const manifestPath = path.join(packageDir, 'package.json');
	const manifest = readJsonFile<PackageManifest>(manifestPath);
	const existingPublishConfig = isRecord(manifest.publishConfig) ? manifest.publishConfig : {};

	manifest.publishConfig = {
		...existingPublishConfig,
		access: typeof existingPublishConfig.access === 'string' ? existingPublishConfig.access : 'public',
		directory: 'dist',
	};
	writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Builds every publishable package, or a filtered subset when positional arguments are
 * provided as package names or package directory names.
 */
async function main(): Promise<void> {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			'stamp-publish-directory': {
				type: 'boolean',
				default: false,
			},
		},
	});
	const filters = new Set(positionals);
	const packageDirs = findPublishablePackageDirs(packagesRoot)
		.filter((packageDir) =>
			matchesRequestedPackage(
				packageDir,
				readJsonFile<PackageManifest>(path.join(packageDir, 'package.json')),
				filters,
			),
		)
		.sort();

	if (packageDirs.length === 0) {
		throw new Error('No publishable packages matched the requested filters.');
	}

	for (const packageDir of packageDirs) {
		await buildPackage(packageDir);
	}

	if (values['stamp-publish-directory']) {
		for (const packageDir of packageDirs) {
			stampPublishDirectory(packageDir);
		}
	}
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
