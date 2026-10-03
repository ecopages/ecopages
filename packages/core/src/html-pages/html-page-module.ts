import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ComponentIdentity } from '../eco/component-identity.ts';
import { registerDiscoveredDependencies } from '../eco/discovered-dependencies.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcoComponent, EcoPageFile, GetMetadata } from '../types/public-types.ts';
import { rapidhash } from '../utils/hash.ts';
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

type HtmlTemplateComponent = EcoComponent & { [HTML_TEMPLATE]?: HtmlTemplate };

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
 * Last source hash each file warned for.
 *
 * @remarks
 * Development recompiles HTML Pages after every server-module invalidation, so
 * this keeps relative-URL warnings to one set per file revision.
 */
const warnedSourceHashes = new Map<string, string>();

/**
 * Returns the compiled template behind an HTML Page or Html shell component.
 */
export function getCompiledHtmlTemplate(component: unknown): HtmlTemplate | undefined {
	return (component as HtmlTemplateComponent | undefined)?.[HTML_TEMPLATE];
}

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

/**
 * Builds the module for one HTML Page or the `html.html` shell.
 *
 * @remarks
 * HTML files are compiled in-process instead of through a bundler loader, so
 * Bun, Node, and Vite-hosted apps load them identically. Rendering needs the
 * owning renderer's asset pipeline, so calling a component directly throws.
 * The identity records the template's local assets as watch files, so editing
 * one invalidates the cached HTML of every route the template renders into.
 */
export function loadHtmlPageModule(appConfig: EcoPagesAppConfig, filePath: string): EcoPageFile {
	const file = path.resolve(filePath);
	const source = fileSystem.readFileSync(file);
	const sourceHash = rapidhash(source).toString(36);
	const options = {
		srcDir: appConfig.absolutePaths.srcDir,
		warn:
			isDevelopmentRuntime() && warnedSourceHashes.get(file) !== sourceHash
				? (message: string) => appLogger.warn(message)
				: undefined,
	};
	warnedSourceHashes.set(file, sourceHash);
	const isShell = file === appConfig.absolutePaths.htmlTemplatePath;
	const template = isShell ? compileHtmlShell(file, source, options) : compileHtmlPage(file, source, options);
	const identity: ComponentIdentity = {
		id: rapidhash(file).toString(36),
		file,
		integration: HTML_PAGES_INTEGRATION_NAME,
	};
	const component = createTemplateComponent(template, identity);
	registerDiscoveredDependencies(identity, {
		components: () => [],
		stylesheets: [],
		watchFiles: getHtmlTemplateWatchFiles(template),
	});

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
 * Returns the Html shell HTML Pages use when the app has no `src/includes/html.*`.
 */
export function getBuiltInHtmlShell(): EcoComponent {
	builtInShell ??= createTemplateComponent(
		compileHtmlShell('ecopages:built-in-html-shell', BUILT_IN_SHELL_SOURCE, { srcDir: '/' }),
	);
	return builtInShell;
}
