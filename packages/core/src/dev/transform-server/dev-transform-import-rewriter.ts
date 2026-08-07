import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { cachedParseSync } from '../../cache/module-parse-cache.ts';
import { isBarePackageImportSpecifier, resolveProjectModulePath } from '../../plugins/tsconfig-import-resolver.ts';
import { resolveRuntimeSpecifierPublicPath } from '../../build/browser/browser-runtime-manifest.ts';
import { resolveDevTransformModuleUrl } from './dev-transform-url.ts';

/**
 * Builds a browser-importable dev-transform URL that changes when the source changes.
 *
 * @remarks
 * Soft HMR reloads cache-bust the active page module, but transitive layout/component
 * imports keep stable pathnames. A content hash query makes the browser ESM module map
 * treat the updated dependency as a new module without a full page reload.
 */
function resolveVersionedDevTransformModuleUrl(srcDir: string, resolvedPath: string): string {
	const baseUrl = resolveDevTransformModuleUrl(srcDir, resolvedPath);
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
 * Rewrites static and dynamic import specifiers to dev-transform or vendor URLs.
 */
export async function rewriteModuleImports(options: RewriteModuleImportsOptions): Promise<{
	code: string;
	dependencies: string[];
}> {
	const normalizedSource = path.resolve(options.sourcePath);
	const dependencies = new Set<string>();
	const specifierNodes: StringLiteralNode[] = [];

	const parseResult = cachedParseSync(normalizedSource, options.code, {
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

	const edits: ImportEdit[] = [];
	for (const specifierNode of specifierNodes) {
		const rewritten = await resolveImportSpecifier({
			specifier: specifierNode.value,
			sourcePath: normalizedSource,
			srcDir: options.srcDir,
			projectRoot: options.projectRoot,
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

async function resolveImportSpecifier(options: {
	specifier: string;
	sourcePath: string;
	srcDir: string;
	projectRoot: string;
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
		const resolvedPath = resolveProjectModulePath(options.projectRoot, options.sourcePath, options.specifier);
		if (!resolvedPath) {
			return undefined;
		}

		options.dependencies.add(resolvedPath);
		return resolveVersionedDevTransformModuleUrl(options.srcDir, resolvedPath);
	}

	return options.resolveVendorUrl(options.specifier);
}
