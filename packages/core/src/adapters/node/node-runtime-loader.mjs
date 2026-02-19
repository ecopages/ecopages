import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from '@mdx-js/mdx';

const appRoot = process.env.ECOPAGES_APP_ROOT ? path.resolve(process.env.ECOPAGES_APP_ROOT) : process.cwd();
const srcDir = process.env.ECOPAGES_SRC_DIR ? path.resolve(process.env.ECOPAGES_SRC_DIR) : path.join(appRoot, 'src');
const distDir = process.env.ECOPAGES_DIST_DIR
	? path.resolve(process.env.ECOPAGES_DIST_DIR)
	: path.join(appRoot, '.eco');
const NODE_PLUGIN_URL_PREFIX = 'ecopages-plugin://';
const VIRTUAL_IMAGES_SPECIFIER = 'ecopages:images';

const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mdx', '.css', '.scss', '.sass', '.less'];

function getVirtualImagesModulePath() {
	return path.join(distDir, 'cache', 'ecopages-image-processor', 'virtual-module.ts');
}

function resolveVirtualImagesModuleUrl() {
	const virtualModulePath = getVirtualImagesModulePath();

	if (!existsSync(virtualModulePath)) {
		return undefined;
	}

	return pathToFileURL(virtualModulePath).href;
}

function getNodeCssProcessor() {
	const processWithBridge = process;
	const bridge = processWithBridge.__ECOPAGES_NODE_PROCESS_CSS__;
	return typeof bridge === 'function' ? bridge : undefined;
}

function getNodePluginRegistry() {
	const processWithRegistry = process;
	return processWithRegistry.__ECOPAGES_NODE_PLUGIN_REGISTRY__;
}

function parseNodePluginUrl(url) {
	if (!url.startsWith(NODE_PLUGIN_URL_PREFIX)) {
		return undefined;
	}

	const parsedUrl = new URL(url);
	const namespace = parsedUrl.hostname;
	const encodedPath = parsedUrl.pathname.startsWith('/') ? parsedUrl.pathname.slice(1) : parsedUrl.pathname;
	const pluginPath = decodeURIComponent(encodedPath);

	return {
		namespace,
		path: pluginPath,
	};
}

function createNodePluginUrl(namespace, pluginPath) {
	return `${NODE_PLUGIN_URL_PREFIX}${namespace}/${encodeURIComponent(pluginPath)}`;
}

function convertPluginLoadResultToModuleSource(result) {
	if (!result) {
		return undefined;
	}

	if (typeof result.contents === 'string') {
		if (result.loader === 'object' && result.exports) {
			const exportEntries = Object.entries(result.exports)
				.map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`)
				.join('\n');

			const defaultExport = Object.prototype.hasOwnProperty.call(result.exports, 'default')
				? `\nexport default ${JSON.stringify(result.exports.default)};`
				: '';

			return `${exportEntries}${defaultExport}`;
		}

		return result.contents;
	}

	if (result.loader === 'object' && result.exports) {
		const exportEntries = Object.entries(result.exports)
			.map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`)
			.join('\n');

		const defaultExport = Object.prototype.hasOwnProperty.call(result.exports, 'default')
			? `\nexport default ${JSON.stringify(result.exports.default)};`
			: '';

		return `${exportEntries}${defaultExport}`;
	}

	return undefined;
}

async function applyNodePluginResolve(specifier, importer) {
	const registry = getNodePluginRegistry();
	if (!registry?.onResolve?.length) {
		return undefined;
	}

	for (const handler of registry.onResolve) {
		if (!handler.filter.test(specifier)) {
			continue;
		}

		const result = await handler.callback({
			path: specifier,
			importer,
			namespace: handler.namespace,
		});

		if (!result?.path) {
			continue;
		}

		if (result.namespace) {
			return {
				url: createNodePluginUrl(result.namespace, result.path),
				shortCircuit: true,
			};
		}

		let resolvedPath = result.path;

		if (!resolvedPath.startsWith('file://') && !path.isAbsolute(resolvedPath) && importer?.startsWith('file://')) {
			const importerPath = fileURLToPath(importer);
			resolvedPath = path.resolve(path.dirname(importerPath), resolvedPath);
		}

		return {
			url: resolvedPath.startsWith('file://') ? resolvedPath : pathToFileURL(resolvedPath).href,
			shortCircuit: true,
		};
	}

	return undefined;
}

async function applyNodePluginLoad(targetPath, namespace = 'file') {
	const registry = getNodePluginRegistry();
	if (!registry?.onLoad?.length) {
		return undefined;
	}

	for (const handler of registry.onLoad) {
		if ((handler.namespace || 'file') !== namespace) {
			continue;
		}

		if (!handler.filter.test(targetPath)) {
			continue;
		}

		const result = await handler.callback({
			path: targetPath,
			namespace,
		});

		const source = convertPluginLoadResultToModuleSource(result);
		if (!source) {
			continue;
		}

		return {
			format: 'module',
			source,
			shortCircuit: true,
		};
	}

	return undefined;
}

function resolveAliasToPath(specifier) {
	if (!specifier.startsWith('@/')) {
		return undefined;
	}

	const candidate = path.join(srcDir, specifier.slice(2));

	if (path.extname(candidate)) {
		return existsSync(candidate) ? candidate : undefined;
	}

	for (const extension of RESOLVABLE_EXTENSIONS) {
		const fileCandidate = `${candidate}${extension}`;
		if (existsSync(fileCandidate)) {
			return fileCandidate;
		}
	}

	for (const extension of RESOLVABLE_EXTENSIONS) {
		const indexCandidate = path.join(candidate, `index${extension}`);
		if (existsSync(indexCandidate)) {
			return indexCandidate;
		}
	}

	return undefined;
}

export async function resolve(specifier, context, nextResolve) {
	if (specifier === VIRTUAL_IMAGES_SPECIFIER) {
		const virtualModuleUrl = resolveVirtualImagesModuleUrl();
		if (virtualModuleUrl) {
			return {
				url: virtualModuleUrl,
				shortCircuit: true,
			};
		}
	}

	const pluginResolved = await applyNodePluginResolve(specifier, context.parentURL);
	if (pluginResolved) {
		return pluginResolved;
	}

	const resolvedPath = resolveAliasToPath(specifier);
	if (resolvedPath) {
		return {
			url: pathToFileURL(resolvedPath).href,
			shortCircuit: true,
		};
	}

	return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
	const pluginUrl = parseNodePluginUrl(url);
	if (pluginUrl) {
		const pluginLoaded = await applyNodePluginLoad(pluginUrl.path, pluginUrl.namespace);
		if (pluginLoaded) {
			return pluginLoaded;
		}
	}

	const parsedUrl = new URL(url);
	const pathname = parsedUrl.pathname;
	const isFileUrl = parsedUrl.protocol === 'file:';

	if (isFileUrl) {
		const pluginLoaded = await applyNodePluginLoad(fileURLToPath(parsedUrl), 'file');
		if (pluginLoaded) {
			return pluginLoaded;
		}
	}

	if (pathname.endsWith('.mdx')) {
		const filePath = fileURLToPath(parsedUrl);
		const source = await readFile(filePath, 'utf-8');
		const compiled = await compile(source, {
			format: 'detect',
			outputFormat: 'program',
			jsxImportSource: process.env.ECOPAGES_JSX_IMPORT_SOURCE ?? '@kitajs/html',
			jsxRuntime: 'automatic',
			development: process.env.NODE_ENV === 'development',
		});

		return {
			format: 'module',
			source: String(compiled.value),
			shortCircuit: true,
		};
	}

	if (
		pathname.endsWith('.css') ||
		pathname.endsWith('.scss') ||
		pathname.endsWith('.sass') ||
		pathname.endsWith('.less')
	) {
		const filePath = fileURLToPath(parsedUrl);
		const rawSource = await readFile(filePath, 'utf-8');
		const nodeCssProcessor = getNodeCssProcessor();
		const source = nodeCssProcessor
			? await nodeCssProcessor({
					filePath,
					contents: rawSource,
				})
			: rawSource;

		return {
			format: 'module',
			source: `export default ${JSON.stringify(source)};`,
			shortCircuit: true,
		};
	}

	return nextLoad(url, context);
}
