import path from 'node:path';
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
import { transform } from 'esbuild';
import ts from 'typescript';

type PackageManifest = {
	name: string;
	private?: boolean;
	version?: string;
	files?: string[];
	main?: string;
	module?: string;
	types?: string;
	exports?: unknown;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	[key: string]: unknown;
};

const repoRoot = path.resolve(import.meta.dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');
const rootPackageJsonPath = path.join(repoRoot, 'package.json');
const sharedNpmTsconfigPath = path.join(repoRoot, 'tsconfig.npm.json');

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);
const tsSourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const supportedManifestFields = ['main', 'module'] as const;

function readJsonFile<T>(filePath: string): T {
	return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function toPosix(filePath: string): string {
	return filePath.replaceAll(path.sep, '/');
}

function isPublishablePackageManifest(packageJsonPath: string): boolean {
	if (packageJsonPath.includes(`${path.sep}__fixtures__${path.sep}`)) {
		return false;
	}

	const manifest = readJsonFile<PackageManifest>(packageJsonPath);
	return !manifest.private && manifest.scripts?.['release:jsr'] === 'bunx jsr publish';
}

function findPublishablePackageDirs(dir: string): string[] {
	const results: string[] = [];

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__fixtures__') {
			continue;
		}

		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...findPublishablePackageDirs(fullPath));
			continue;
		}

		if (entry.name !== 'package.json') {
			continue;
		}

		if (isPublishablePackageManifest(fullPath)) {
			results.push(path.dirname(fullPath));
		}
	}

	return results;
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
		relativePath.includes('/test/') ||
		relativePath.includes('/__tests__/') ||
		/\.(test|spec)\.[^.]+$/i.test(relativePath)
	);
}

function shouldSkipDirectory(name: string): boolean {
	return name === 'node_modules' || name === 'dist' || name === '__fixtures__' || name === 'test' || name === '__tests__';
}

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

function scanPackageFiles(packageDir: string, roots: string[]): {
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

function getLoader(filePath: string): 'ts' | 'tsx' | 'js' | 'jsx' {
	const extension = path.extname(filePath).toLowerCase();
	if (extension === '.tsx') return 'tsx';
	if (extension === '.jsx') return 'jsx';
	if (extension === '.ts' || extension === '.mts' || extension === '.cts') return 'ts';
	return 'js';
}

function rewriteRelativeSpecifiers(content: string): string {
	return content.replace(/(["'])((?:\.{1,2}\/)[^"'\n\r]+?)\.(cts|mts|tsx|ts|jsx)(\1)/g, (_match, quote, specifier, extension, closingQuote) => {
		const nextExtension = extension === 'mts' ? 'mjs' : extension === 'cts' ? 'cjs' : 'js';
		return `${quote}${specifier}.${nextExtension}${closingQuote}`;
	});
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

function rewriteExportMap(value: unknown): unknown {
	if (typeof value === 'string') {
		return rewriteManifestRuntimePath(value);
	}

	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return value;
	}

	const rewritten: Record<string, unknown> = {};
	for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
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

function createTsExtensionExportAliases(exportsField: unknown): Record<string, unknown> {
	if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
		return {};
	}

	const aliases: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(exportsField as Record<string, unknown>)) {
		if (key === '.' || key.endsWith('.ts')) {
			continue;
		}

		aliases[`${key}.ts`] = value;
	}

	return aliases;
}

function rewriteWorkspaceRanges(record: Record<string, string> | undefined, version: string): Record<string, string> | undefined {
	if (!record) {
		return record;
	}

	const rewritten = Object.fromEntries(
		Object.entries(record).map(([name, range]) => [name, range === 'workspace:*' ? version : range]),
	);

	return rewritten;
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

	const compilerOptions: ts.CompilerOptions = {
		...packageConfig.options,
		...sharedConfig.options,
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
	};

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

async function buildJavaScript(packageDir: string, codeFiles: string[], distDir: string): Promise<void> {
	const packageTsconfigPath = path.join(packageDir, 'tsconfig.json');
	const tsconfigRaw = existsSync(packageTsconfigPath)
		? ts.readConfigFile(packageTsconfigPath, ts.sys.readFile).config
		: {};

	for (const sourceFile of codeFiles) {
		const extension = path.extname(sourceFile);
		const relativePath = path.relative(packageDir, sourceFile);
		const outputRelativePath = relativePath.replace(/\.(mts|cts|tsx|ts|jsx|js)$/u, (_match, fileExtension: string) => {
			if (fileExtension === 'mts') return '.mjs';
			if (fileExtension === 'cts') return '.cjs';
			return '.js';
		});
		const outputPath = path.join(distDir, outputRelativePath);
		const source = readFileSync(sourceFile, 'utf-8');
		const transformed = await transform(source, {
			loader: getLoader(sourceFile),
			format: 'esm',
			target: 'es2022',
			sourcefile: toPosix(relativePath),
			tsconfigRaw,
		});

		const output = rewriteRelativeSpecifiers(transformed.code);
		writeTextFile(outputPath, output);

		if (extension === '.cts') {
			continue;
		}
	}
}

function createDistManifest(manifest: PackageManifest, version: string): PackageManifest {
	const rewrittenExports = rewriteExportMap(manifest.exports);
	const distManifest: PackageManifest = {
		...manifest,
		version,
		dependencies: rewriteWorkspaceRanges(manifest.dependencies, version),
		peerDependencies: rewriteWorkspaceRanges(manifest.peerDependencies, version),
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

	delete distManifest.private;
	delete distManifest.scripts;
	delete distManifest.devDependencies;
	delete distManifest.files;

	return distManifest;
}

function copyMetadataFiles(packageDir: string, distDir: string): void {
	for (const fileName of ['README.md', 'CHANGELOG.md', 'LICENSE']) {
		const sourcePath = path.join(packageDir, fileName);
		if (!existsSync(sourcePath)) {
			continue;
		}

		copyFileSync(sourcePath, path.join(distDir, fileName));
	}
}

function copySourceFilesToDist(packageDir: string, codeFiles: string[], distDir: string): void {
	for (const filePath of codeFiles) {
		copyFileToDist(filePath, packageDir, distDir);
	}
}

function matchesRequestedPackage(packageDir: string, manifest: PackageManifest, filters: Set<string>): boolean {
	if (filters.size === 0) {
		return true;
	}

	const relativeDir = toPosix(path.relative(repoRoot, packageDir));
	return filters.has(manifest.name) || filters.has(relativeDir) || filters.has(path.basename(packageDir));
}

async function buildPackage(packageDir: string, version: string): Promise<void> {
	const packageJsonPath = path.join(packageDir, 'package.json');
	const manifest = readJsonFile<PackageManifest>(packageJsonPath);
	const roots = collectPackageRoots(packageDir, manifest);
	const { codeFiles, declarationFiles, assetFiles } = scanPackageFiles(packageDir, roots);
	const distDir = path.join(packageDir, 'dist');

	rmSync(distDir, { recursive: true, force: true });
	mkdirSync(distDir, { recursive: true });

	await buildJavaScript(packageDir, codeFiles, distDir);
	emitDeclarations(packageDir, codeFiles, declarationFiles, distDir);
	copySourceFilesToDist(packageDir, codeFiles, distDir);

	for (const filePath of declarationFiles) {
		copyFileToDist(filePath, packageDir, distDir, true);
	}

	for (const filePath of assetFiles) {
		copyFileToDist(filePath, packageDir, distDir);
	}

	copyMetadataFiles(packageDir, distDir);

	const distManifest = createDistManifest(manifest, version);
	writeTextFile(path.join(distDir, 'package.json'), `${JSON.stringify(distManifest, null, 2)}\n`);

	console.log(`Built ${manifest.name} -> ${toPosix(path.relative(repoRoot, distDir))}`);
}

async function main(): Promise<void> {
	const filters = new Set(process.argv.slice(2));
	const rootPackage = readJsonFile<{ version: string }>(rootPackageJsonPath);
	const packageDirs = findPublishablePackageDirs(packagesRoot)
		.filter((packageDir) => matchesRequestedPackage(packageDir, readJsonFile<PackageManifest>(path.join(packageDir, 'package.json')), filters))
		.sort();

	if (packageDirs.length === 0) {
		throw new Error('No publishable packages matched the requested filters.');
	}

	for (const packageDir of packageDirs) {
		await buildPackage(packageDir, rootPackage.version);
	}
	}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});