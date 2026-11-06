import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import { isBarePackageImportSpecifier, resolveProjectModulePath } from '../../plugins/tsconfig-import-resolver.ts';
import { resolveRuntimeSpecifierPublicPath } from '../../build/browser/browser-runtime-manifest.ts';
import { resolveDevTransformModuleUrl } from './dev-transform-url.ts';
import { appLogger } from '../../global/app-logger.ts';
import {
	WORKER_CONSTRUCTOR_PATTERN,
	findWorkerUrls,
	formatClassicWorkerError,
	formatUnbundledWorkerWarning,
	formatWorkerUrlQueryError,
	isUnbundledWorkerUrl,
} from '../../build/worker-urls.ts';

/**
 * Builds a browser-importable dev-transform URL that changes when the source changes.
 *
 * @remarks
 * Soft HMR reloads cache-bust the active page module, but transitive layout/component
 * imports keep stable pathnames. A content hash query makes the browser ESM module map
 * treat the updated dependency as a new module without a full page reload.
 */
function resolveVersionedDevTransformModuleUrl(
	srcDir: string,
	resolvedPath: string,
	extraRoots: readonly string[] = [],
): string {
	const baseUrl = resolveDevTransformModuleUrl(srcDir, resolvedPath, extraRoots);
	if (!fileSystem.exists(resolvedPath)) {
		return baseUrl;
	}

	return `${baseUrl}?v=${fileSystem.hash(resolvedPath)}`;
}

type ImportEdit = {
	start: number;
	end: number;
	replacement: string;
};

type StringLiteralNode = {
	start: number;
	end: number;
	value: string;
};

type RewriteModuleImportsOptions = {
	code: string;
	sourcePath: string;
	srcDir: string;
	projectRoot: string;
	extraModuleRoots?: readonly string[];
	runtimeSpecifierMap: ReadonlyMap<string, string>;
	resolveVendorUrl: (specifier: string) => Promise<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object';
}

function readStringLiteral(node: unknown): StringLiteralNode | undefined {
	if (!isRecord(node)) {
		return undefined;
	}

	if (node.type !== 'StringLiteral' && node.type !== 'Literal') {
		return undefined;
	}

	if (typeof node.value !== 'string' || typeof node.start !== 'number' || typeof node.end !== 'number') {
		return undefined;
	}

	return { start: node.start, end: node.end, value: node.value };
}

/**
 * Points each relative module Worker URL at the worker's dev-transform URL.
 *
 * @remarks
 * The URL stays an argument of `new URL(..., import.meta.url)`; an absolute path resolves against the page origin.
 * A classic worker fails like a production build, since the served worker is an ES module with imports. A URL
 * that is not a relative literal is left as written and warned on each compile.
 */
function rewriteWorkerUrls(
	program: unknown,
	options: RewriteModuleImportsOptions,
	sourcePath: string,
	dependencies: Set<string>,
): ImportEdit[] {
	const edits: ImportEdit[] = [];
	if (!WORKER_CONSTRUCTOR_PATTERN.test(options.code)) return edits;
	for (const url of findWorkerUrls(program, options.code)) {
		if (url.kind === 'classic') throw new Error(formatClassicWorkerError(url, sourcePath));
		if (url.kind === 'query') throw new Error(formatWorkerUrlQueryError(url, sourcePath));
		if (isUnbundledWorkerUrl(url)) {
			appLogger.warn(formatUnbundledWorkerWarning(url, sourcePath));
			continue;
		}
		const workerPath = resolveProjectModulePath(options.projectRoot, sourcePath, url.specifier);
		if (!workerPath) {
			throw new Error(
				`[dev-transform] Could not resolve the ${url.constructorName} URL ${JSON.stringify(url.specifier)} in ${sourcePath}.`,
			);
		}
		dependencies.add(workerPath);
		const workerUrl = resolveVersionedDevTransformModuleUrl(options.srcDir, workerPath, options.extraModuleRoots);
		edits.push({ start: url.start, end: url.end, replacement: JSON.stringify(workerUrl) });
	}
	return edits;
}

/**
 * Rewrites static and dynamic import specifiers to dev-transform or vendor URLs.
 */
export async function rewriteModuleImports(options: RewriteModuleImportsOptions): Promise<{
	code: string;
	dependencies: string[];
}> {
	const normalizedSource = path.resolve(options.sourcePath);
	const dependencies = new Set<string>();
	const specifierNodes: StringLiteralNode[] = [];

	const parseResult = parseModuleSource(normalizedSource, options.code, {
		sourceType: 'module',
		lang: path.extname(normalizedSource).endsWith('x') ? 'tsx' : 'ts',
	});

	const walk = (node: unknown): void => {
		if (!isRecord(node)) {
			return;
		}

		if (
			node.type === 'ImportDeclaration' ||
			node.type === 'ExportNamedDeclaration' ||
			node.type === 'ExportAllDeclaration'
		) {
			const literal = readStringLiteral(node.source);
			if (literal) {
				specifierNodes.push(literal);
			}
		}

		if (node.type === 'ImportExpression') {
			const literal = readStringLiteral(node.source);
			if (literal) {
				specifierNodes.push(literal);
			}
		}

		for (const value of Object.values(node)) {
			if (Array.isArray(value)) {
				for (const child of value) {
					walk(child);
				}
			} else {
				walk(value);
			}
		}
	};

	walk(parseResult.program);

	const edits: ImportEdit[] = rewriteWorkerUrls(parseResult.program, options, normalizedSource, dependencies);
	for (const specifierNode of specifierNodes) {
		const rewritten = await resolveImportSpecifier({
			specifier: specifierNode.value,
			sourcePath: normalizedSource,
			srcDir: options.srcDir,
			projectRoot: options.projectRoot,
			extraModuleRoots: options.extraModuleRoots,
			runtimeSpecifierMap: options.runtimeSpecifierMap,
			resolveVendorUrl: options.resolveVendorUrl,
			dependencies,
		});

		if (!rewritten || rewritten === specifierNode.value) {
			continue;
		}

		const quote = options.code[specifierNode.start] === "'" ? "'" : '"';
		edits.push({
			start: specifierNode.start,
			end: specifierNode.end,
			replacement: `${quote}${rewritten}${quote}`,
		});
	}

	edits.sort((left, right) => right.start - left.start);
	let code = options.code;
	for (const edit of edits) {
		code = `${code.slice(0, edit.start)}${edit.replacement}${code.slice(edit.end)}`;
	}

	return {
		code,
		dependencies: [...dependencies],
	};
}

/**
 * @remarks
 * Plain-module discovery imports the Eco Components of plain modules by absolute file path, so a module
 * whose plain imports reach a Component carries such a specifier into the browser.
 */
function resolveAbsoluteModulePath(specifier: string): string | undefined {
	return path.isAbsolute(specifier) && fileSystem.exists(specifier) ? path.resolve(specifier) : undefined;
}

async function resolveImportSpecifier(options: {
	specifier: string;
	sourcePath: string;
	srcDir: string;
	projectRoot: string;
	extraModuleRoots?: readonly string[];
	runtimeSpecifierMap: ReadonlyMap<string, string>;
	resolveVendorUrl: (specifier: string) => Promise<string>;
	dependencies: Set<string>;
}): Promise<string | undefined> {
	const runtimeUrl = resolveRuntimeSpecifierPublicPath(options.specifier, options.runtimeSpecifierMap);
	if (runtimeUrl) {
		return runtimeUrl;
	}

	if (options.specifier.startsWith('node:')) {
		throw new Error(
			`[dev-transform] Node builtin "${options.specifier}" imported from client module ${options.sourcePath}. ` +
				`Check package "browser" exports / client-graph boundary for the importer.`,
		);
	}

	if (options.specifier.startsWith('.') || !isBarePackageImportSpecifier(options.specifier, options.projectRoot)) {
		const resolvedPath =
			resolveAbsoluteModulePath(options.specifier) ??
			resolveProjectModulePath(options.projectRoot, options.sourcePath, options.specifier);
		if (!resolvedPath) {
			return undefined;
		}

		options.dependencies.add(resolvedPath);
		return resolveVersionedDevTransformModuleUrl(options.srcDir, resolvedPath, options.extraModuleRoots);
	}

	return options.resolveVendorUrl(options.specifier);
}
