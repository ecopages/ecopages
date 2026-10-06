import { readdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import { RESOLVED_ASSETS_DIR } from '../config/constants.ts';
import { isCssImport } from '../plugins/component-import-discovery.ts';
import { stripsSideEffectStylesheetImports } from '../plugins/eco-component-meta-plugin.ts';
import { isBarePackageImportSpecifier, resolveProjectModulePath } from '../plugins/tsconfig-import-resolver.ts';
import { BrowserBundleService } from '../services/assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { isProductionRuntime } from '../utils/runtime.ts';
import { compileHtmlPage, compileHtmlShell } from './html-page-template.ts';

type ModuleScriptBuild = {
	fingerprint: string;
	files: string[];
	urls: Promise<ReadonlyMap<string, string>>;
};

const builds = new WeakMap<EcoPagesAppConfig, ModuleScriptBuild>();

/**
 * Returns the URL of every `<script type="module">` of every HTML Page and the Html shell, keyed
 * by the real path of the script file.
 *
 * @remarks
 * All of them are built in one multi-entry build with code splitting, as Vite and Astro build the
 * pages of a site together. A module several scripts import, on one Page, in the shell, or on
 * different Pages, packages included, is then one chunk with one URL and runs once, and a script
 * keeps its URL on every Page, so the browser router does not run it again after a client
 * navigation. Separate builds each inline such a module, or name its chunk after their other
 * entries.
 *
 * Production builds once. Otherwise the build is reused while the HTML files, the scripts they
 * reference, and the local modules {@link scanModuleScript} visits from them keep their size and
 * modification time, or stay missing; an edit to a package is not detected. An HTML file that
 * does not compile is left out, so only its own render fails. A script that imports a stylesheet
 * is left out too, so only the HTML files that load it fail. A script that does not build fails
 * the whole build, so every HTML Page with a module script fails to render; a failed build is not
 * kept, so the next render builds again.
 */
export function getHtmlPageModuleScriptUrls(appConfig: EcoPagesAppConfig): Promise<ReadonlyMap<string, string>> {
	const previous = builds.get(appConfig);
	if (previous && isProductionRuntime()) {
		return previous.urls;
	}

	const htmlFiles = listHtmlFiles(appConfig);
	if (previous && previous.fingerprint === fingerprint([...htmlFiles, ...previous.files])) {
		return previous.urls;
	}

	const scans = [...new Set(htmlFiles.flatMap((file) => collectModuleScripts(appConfig, file)))].map((script) => ({
		script,
		...scanModuleScript(appConfig, script),
	}));
	const files = [...new Set(scans.flatMap((scan) => scan.files))];
	const build: ModuleScriptBuild = {
		fingerprint: fingerprint([...htmlFiles, ...files]),
		files,
		urls: buildModuleScripts(
			appConfig,
			scans.flatMap((scan) => (scan.stylesheetImport ? [] : [scan.script])),
		),
	};
	builds.set(appConfig, build);
	build.urls.catch(() => {
		if (builds.get(appConfig) === build) builds.delete(appConfig);
	});
	return build.urls;
}

const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;

type StylesheetImport = { importer: string; stylesheet: string };

type ModuleScriptScan = { files: string[]; stylesheetImport?: StylesheetImport; fingerprint: string };

/** The fields of an import or export statement the scan reads from the parsed program. */
type ModuleStatement = {
	type: string;
	source?: { value: string } | null;
	specifiers?: Array<{ importKind?: string; exportKind?: string }>;
	importKind?: string;
	exportKind?: string;
	exported?: unknown;
};

const scans = new WeakMap<EcoPagesAppConfig, Map<string, ModuleScriptScan>>();

function isTypeOnly(statement: ModuleStatement): boolean {
	const specifiers = statement.specifiers ?? [];
	return (
		statement.importKind === 'type' ||
		statement.exportKind === 'type' ||
		(specifiers.length > 0 &&
			specifiers.every((entry) => entry.importKind === 'type' || entry.exportKind === 'type'))
	);
}

function bindsNothing(statement: ModuleStatement): boolean {
	return statement.type === 'ExportAllDeclaration' ? !statement.exported : (statement.specifiers ?? []).length === 0;
}

function resolvePackageFile(importer: string, specifier: string): string | undefined {
	try {
		return createRequire(importer).resolve(specifier);
	} catch {
		return undefined;
	}
}

/** The stylesheet an import names, by its resolved path or, when it does not resolve, its specifier. */
function stylesheetPath(
	appConfig: EcoPagesAppConfig,
	importer: string,
	specifier: string,
	resolved: string | undefined,
): string | undefined {
	const target =
		resolved ??
		(isBarePackageImportSpecifier(specifier, appConfig.rootDir)
			? resolvePackageFile(importer, specifier)
			: undefined) ??
		specifier;
	return target.endsWith('.css') ? target : undefined;
}

/**
 * Returns the first side-effect stylesheet import of `file`, or the local modules it imports.
 */
function readModuleImports(
	appConfig: EcoPagesAppConfig,
	file: string,
): { stylesheet?: string; dependencies: string[] } {
	const source = fileSystem.readFileSync(file);
	const { program, module } = parseModuleSource(file, source);
	const stripped = stripsSideEffectStylesheetImports(appConfig, file, source);
	const resolve = (specifier: string) =>
		resolveProjectModulePath(appConfig.rootDir, file, specifier, { preserveBarrel: true });
	const dependencies: string[] = [];

	for (const statement of program.body as unknown as ModuleStatement[]) {
		const specifier = statement.source?.value;
		if (!specifier || isTypeOnly(statement)) continue;
		const resolved = resolve(specifier);
		const strippedByTransform =
			stripped && statement.type === 'ImportDeclaration' && resolved !== undefined && isCssImport(specifier);
		if (bindsNothing(statement) && !strippedByTransform) {
			const stylesheet = stylesheetPath(appConfig, file, specifier, resolved);
			if (stylesheet) return { stylesheet, dependencies };
		}
		if (resolved) dependencies.push(resolved);
	}
	for (const { moduleRequest } of module.dynamicImports) {
		const literal = /^(['"`])([^'"`$]*)\1$/.exec(source.slice(moduleRequest.start, moduleRequest.end));
		const resolved = literal ? resolve(literal[2]!) : undefined;
		if (resolved) dependencies.push(resolved);
	}
	return { dependencies };
}

/**
 * Finds a side-effect stylesheet import, such as `import './styles.css'`, `import 'swiper/css'`,
 * or `export * from './styles.css'`, in `script` or a local module it imports, statically or
 * dynamically, and lists the files it visited.
 *
 * @remarks
 * Such an import never reaches the Page: the PostCSS Processor turns the file into a module that
 * exports the CSS as a string, and without a CSS Processor the bundler rejects it. An import that
 * binds that string, as `import styles from './styles.css'`, is left alone; without a CSS
 * Processor it still fails the build. Type-only imports are not followed, and imports the
 * component meta transform moves into Component Dependencies are not reported.
 *
 * Relative and tsconfig-alias imports are followed; packages are not scanned, but a side-effect
 * import of a package stylesheet is reported. The result is kept while the visited files keep
 * their size and modification time. The scan stops at the first stylesheet import, so the visited
 * files then include every file whose edit can remove it.
 */
export function scanModuleScript(
	appConfig: EcoPagesAppConfig,
	script: string,
): { files: string[]; stylesheetImport?: StylesheetImport } {
	const entry = path.resolve(script);
	let cache = scans.get(appConfig);
	if (!cache) {
		cache = new Map();
		scans.set(appConfig, cache);
	}
	const previous = cache.get(entry);
	if (previous && previous.fingerprint === fingerprint(previous.files)) return previous;

	const visited = new Set<string>();
	const visit = (file: string): StylesheetImport | undefined => {
		if (visited.has(file)) return undefined;
		visited.add(file);
		if (!SCRIPT_FILE.test(file) || !fileSystem.exists(file)) return undefined;

		const { stylesheet, dependencies } = readModuleImports(appConfig, file);
		if (stylesheet) return { importer: file, stylesheet };
		for (const dependency of dependencies) {
			const found = visit(dependency);
			if (found) return found;
		}
		return undefined;
	};
	const stylesheetImport = visit(entry);
	const files = [...visited];
	const scan: ModuleScriptScan = { files, stylesheetImport, fingerprint: fingerprint(files) };
	cache.set(entry, scan);
	return scan;
}

function listHtmlFiles(appConfig: EcoPagesAppConfig): string[] {
	const { pagesDir, htmlTemplatePath } = appConfig.absolutePaths;
	const pages = fileSystem.exists(pagesDir)
		? readdirSync(pagesDir, { recursive: true, encoding: 'utf8' })
				.filter((name) => name.endsWith('.html'))
				.map((name) => path.join(pagesDir, name))
				.sort()
		: [];
	return htmlTemplatePath?.endsWith('.html') && fileSystem.exists(htmlTemplatePath)
		? [htmlTemplatePath, ...pages]
		: pages;
}

function fingerprint(files: string[]): string {
	return files
		.map((file) => {
			const stats = statSync(file, { throwIfNoEntry: false });
			return `${file}:${stats?.size}:${stats?.mtimeMs}`;
		})
		.join('\n');
}

function collectModuleScripts(appConfig: EcoPagesAppConfig, file: string): string[] {
	const options = { srcDir: appConfig.absolutePaths.srcDir };
	const source = fileSystem.readFileSync(file);
	try {
		const template =
			file === appConfig.absolutePaths.htmlTemplatePath
				? compileHtmlShell(file, source, options)
				: compileHtmlPage(file, source, options);
		return template.assets.flatMap((asset) => (asset.kind === 'module-script' ? [asset.filepath] : []));
	} catch {
		return [];
	}
}

/**
 * @remarks
 * Entries are named after their path in the source directory, so a script keeps the
 * `/assets/pages/counter-[hash].js` shape it has when built on its own; a name already taken, as
 * by `a.ts` beside `a.js`, gets a `-2`, `-3`, ... suffix.
 */
async function buildModuleScripts(
	appConfig: EcoPagesAppConfig,
	referencedScripts: string[],
): Promise<ReadonlyMap<string, string>> {
	const scripts = referencedScripts.filter((script) => fileSystem.exists(script));
	if (scripts.length === 0) {
		return new Map();
	}

	const { srcDir, distDir } = appConfig.absolutePaths;
	const entrypoints = new Map<string, string>();
	for (const script of scripts) {
		const baseName = path
			.relative(srcDir, script)
			.split(path.sep)
			.join('/')
			.replace(/\.[^./]+$/, '');
		let name = baseName;
		for (let suffix = 2; entrypoints.has(name); suffix++) name = `${baseName}-${suffix}`;
		entrypoints.set(name, script);
	}

	const result = await new BrowserBundleService(appConfig).bundle({
		profile: 'browser-script',
		entrypoints: Object.fromEntries(entrypoints),
		outdir: path.join(distDir, RESOLVED_ASSETS_DIR),
		root: appConfig.rootDir,
		splitting: true,
		naming: '[name]-[hash].[ext]',
		minify: isProductionRuntime(),
	});
	if (!result.success) {
		throw new Error(
			`[ecopages] Could not build the HTML Page module scripts: ${result.logs.map((log) => log.message).join(' | ')}`,
		);
	}

	if (isProductionRuntime()) {
		for (const { path: output } of result.outputs) {
			if (output.endsWith('.js')) fileSystem.gzipFile(output);
		}
	}

	const urls = new Map<string, string>();
	for (const script of scripts) {
		const output = result.entryOutputs?.[realpathSync(script)];
		if (output) urls.set(realpathSync(script), `/${path.relative(distDir, output).split(path.sep).join('/')}`);
	}
	return urls;
}
