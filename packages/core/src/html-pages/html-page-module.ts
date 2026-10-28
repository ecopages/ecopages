import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ComponentIdentity } from '../eco/component-identity.ts';
import { registerDiscoveredDependencies } from '../eco/discovered-dependencies.ts';
import { appLogger } from '../global/app-logger.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type { EcoComponent, EcoPageFile, GetMetadata } from '../types/contracts.ts';
import { contentHash } from '../utils/content-hash.ts';
import { toRootRelativePath } from '../utils/root-relative-path.ts';
import { isDevelopmentRuntime } from '../utils/runtime.ts';
import {
	compileHtmlPage,
	compileHtmlShell,
	getHtmlTemplateWatchFiles,
	type HtmlTemplate,
} from './html-page-template.ts';

export const HTML_PAGES_INTEGRATION_NAME = 'html-pages';

/**
 * Interned so a separately bundled copy of core still finds the template.
 */
const HTML_TEMPLATE = Symbol.for('ecopages.html-pages.template');

type HtmlTemplateComponent = EcoComponent & { [HTML_TEMPLATE]?: HtmlTemplate; metadata?: GetMetadata };

const BUILT_IN_SHELL_SOURCE = `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
	</head>
	<body>
		<!-- eco:children -->
	</body>
</html>`;

let builtInShell: EcoComponent | undefined;

/**
 * Logs a development warning found while rendering `file`, once per `key` and file revision.
 *
 * @remarks
 * Some warnings depend on rendering, such as processed `<style>` output or a preload that names
 * a file of the shell, so they cannot be logged when the file compiles. `message` runs only when
 * the warning is logged, so a costly message is built at most once per revision.
 */
export function warnHtmlTemplateRender(
	appConfig: EcoPagesAppConfig,
	file: string,
	key: string,
	message: () => string,
): void {
	if (!isDevelopmentRuntime()) return;
	const warningState = requireAppRuntime(appConfig).htmlPageWarnings;
	const revision = warningState.warnedSourceHashes.get(file);
	let warned = warningState.renderWarnings.get(file);
	if (!warned || warned.revision !== revision) {
		warned = { revision, keys: new Set() };
		warningState.renderWarnings.set(file, warned);
	}
	if (warned.keys.has(key)) return;
	warned.keys.add(key);
	appLogger.warn(message());
}

/**
 * Returns the compiled template behind an HTML Page or Html shell component.
 */
export function getCompiledHtmlTemplate(component: unknown): HtmlTemplate | undefined {
	return (component as HtmlTemplateComponent | undefined)?.[HTML_TEMPLATE];
}

export type SerializedHtmlPageModule = {
	template: HtmlTemplate;
	identity?: ComponentIdentity;
};

function createTemplateComponent(template: HtmlTemplate, identity?: ComponentIdentity): HtmlTemplateComponent {
	const render = () => {
		throw new Error(
			`[ecopages] ${template.file} renders only through the ${HTML_PAGES_INTEGRATION_NAME} Integration.`,
		);
	};
	return Object.assign(render, {
		config: { integration: HTML_PAGES_INTEGRATION_NAME, ...(identity ? { identity } : {}) },
		[HTML_TEMPLATE]: template,
	});
}

function assembleHtmlPageFile(template: HtmlTemplate, identity?: ComponentIdentity): EcoPageFile {
	const component = createTemplateComponent(template, identity);
	if (identity) {
		registerDiscoveredDependencies(identity, {
			components: () => [],
			stylesheets: [],
			watchFiles: getHtmlTemplateWatchFiles(template),
		});
	}
	if (template.kind === 'page') {
		const metadata: GetMetadata = ({ appConfig: { defaultMetadata } }) => ({
			...defaultMetadata,
			...template.metadata,
		});
		component.metadata = metadata;
	}
	return { default: component };
}

/**
 * Builds the module for one HTML Page or the `html.html` shell.
 *
 * @remarks
 * HTML files are compiled in-process instead of through a bundler loader, so
 * Bun and Node load them identically. Rendering needs the
 * owning renderer's asset pipeline, so calling a component directly throws.
 * The identity records the template's local assets as watch files, so editing
 * one invalidates the cached HTML of every route the template renders into.
 */
export function loadHtmlPageModule(appConfig: EcoPagesAppConfig, filePath: string): EcoPageFile {
	const file = path.resolve(filePath);
	const source = fileSystem.readFileSync(file);
	const sourceHash = BigInt(`0x${contentHash(source, 16)}`).toString(36);
	const warningState = requireAppRuntime(appConfig).htmlPageWarnings;
	const options = {
		srcDir: appConfig.absolutePaths.srcDir,
		warn:
			isDevelopmentRuntime() && warningState.warnedSourceHashes.get(file) !== sourceHash
				? (message: string) => appLogger.warn(message)
				: undefined,
	};
	warningState.warnedSourceHashes.set(file, sourceHash);
	const isShell = file === appConfig.absolutePaths.htmlTemplatePath;
	const template = isShell ? compileHtmlShell(file, source, options) : compileHtmlPage(file, source, options);
	const identity: ComponentIdentity = {
		id: BigInt(`0x${contentHash(file, 16)}`).toString(36),
		file,
		integration: HTML_PAGES_INTEGRATION_NAME,
	};
	return assembleHtmlPageFile(template, identity);
}

function relativizeHtmlFilePath(rootDir: string, filePath: string): string {
	return path.isAbsolute(filePath) ? toRootRelativePath(rootDir, filePath) : filePath;
}

function relativizeHtmlTemplate(rootDir: string, template: HtmlTemplate): HtmlTemplate {
	const relativize = (filePath: string) => relativizeHtmlFilePath(rootDir, filePath);
	const assets = template.assets.map((asset) =>
		'filepath' in asset ? { ...asset, filepath: relativize(asset.filepath) } : asset,
	);
	return { ...template, file: relativize(template.file), assets };
}

/**
 * Records a compiled HTML Page or Html shell so production can import it without compiling.
 *
 * @remarks
 * File paths are stored relative to `rootDir` so the emitted module has no
 * absolute paths of the build machine.
 */
export function serializeHtmlPageModule(module: EcoPageFile, rootDir: string): SerializedHtmlPageModule {
	const component = module.default as HtmlTemplateComponent;
	const template = component[HTML_TEMPLATE];
	if (!template) {
		throw new Error('[ecopages] Cannot serialize an HTML Page module that has no compiled template.');
	}
	const identity = component.config?.identity;
	return {
		template: relativizeHtmlTemplate(rootDir, template),
		identity: identity?.file ? { ...identity, file: relativizeHtmlFilePath(rootDir, identity.file) } : identity,
	};
}

function resolveHtmlFilePath(rootDir: string, filePath: string): string {
	return path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
}

function resolveHtmlTemplate(rootDir: string, template: HtmlTemplate): HtmlTemplate {
	const resolve = (filePath: string) => resolveHtmlFilePath(rootDir, filePath);
	const assets = template.assets.map((asset) =>
		'filepath' in asset ? { ...asset, filepath: resolve(asset.filepath) } : asset,
	);
	return { ...template, file: resolve(template.file), assets };
}

/**
 * Restores a compiled HTML Page or Html shell from {@link serializeHtmlPageModule}.
 *
 * @param rootDir - App root used to resolve stored relative file paths.
 */
export function reviveHtmlPageModule(data: SerializedHtmlPageModule, rootDir?: string): EcoPageFile {
	const template = rootDir ? resolveHtmlTemplate(rootDir, data.template) : data.template;
	const identity =
		rootDir && data.identity?.file
			? { ...data.identity, file: resolveHtmlFilePath(rootDir, data.identity.file) }
			: data.identity;
	return assembleHtmlPageFile(template, identity);
}

/**
 * Returns the Html shell HTML Pages use when the app has no `src/includes/html.*`.
 */
export function getBuiltInHtmlShell(): EcoComponent {
	builtInShell ??= createTemplateComponent(
		compileHtmlShell('ecopages:built-in-html-shell', BUILT_IN_SHELL_SOURCE, { srcDir: '/' }),
	);
	return builtInShell;
}
