import { readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { RESOLVED_ASSETS_DIR } from '../config/constants.ts';
import { BrowserBundleService } from '../services/assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { isProductionRuntime } from '../utils/runtime.ts';
import { compileHtmlPage, compileHtmlShell } from './html-page-template.ts';

type ModuleScriptBuild = {
	fingerprint: string;
	scripts: string[];
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
 * Production builds once. Otherwise the build is reused while the HTML files and the scripts they
 * reference keep their size and modification time, or stay missing; an edit to a module those
 * scripts import is not detected. An HTML file that does not compile is left out, so only its own
 * render fails. A script that does not build fails the whole build, so every HTML Page with a
 * module script fails to render; a failed build is not kept, so the next render builds again.
 */
export function getHtmlPageModuleScriptUrls(appConfig: EcoPagesAppConfig): Promise<ReadonlyMap<string, string>> {
	const previous = builds.get(appConfig);
	if (previous && isProductionRuntime()) {
		return previous.urls;
	}

	const htmlFiles = listHtmlFiles(appConfig);
	if (previous && previous.fingerprint === fingerprint([...htmlFiles, ...previous.scripts])) {
		return previous.urls;
	}

	const scripts = [...new Set(htmlFiles.flatMap((file) => collectModuleScripts(appConfig, file)))];
	const build: ModuleScriptBuild = {
		fingerprint: fingerprint([...htmlFiles, ...scripts]),
		scripts,
		urls: buildModuleScripts(appConfig, scripts),
	};
	builds.set(appConfig, build);
	build.urls.catch(() => {
		if (builds.get(appConfig) === build) builds.delete(appConfig);
	});
	return build.urls;
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
