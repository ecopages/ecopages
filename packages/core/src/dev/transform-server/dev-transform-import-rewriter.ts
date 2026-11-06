import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import { isBarePackageImportSpecifier, resolveProjectModulePath } from '../../plugins/tsconfig-import-resolver.ts';
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

/** The served URL of a bare import, and whether the vendor build found its module to be CommonJS. */
export type VendorImport = {
	url: string;
	commonJs: boolean;
};

/** A module specifier and, for a static import or re-export with a source, the declaration that holds it. */
type SpecifierSite = {
	literal: StringLiteralNode;
	declaration?: Record<string, unknown>;
};

type ResolvedSpecifier = {
	specifier: string;
	commonJs: boolean;
};

type RewriteModuleImportsOptions = {
	code: string;
	sourcePath: string;
	srcDir: string;
	projectRoot: string;
	extraModuleRoots?: readonly string[];
	resolveVendorImport: (specifier: string) => Promise<VendorImport>;
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
 *
 * @remarks
 * Every specifier resolves at once, so the new bare imports of one module join the same vendor build instead of
 * waiting for one build each.
 */
export async function rewriteModuleImports(options: RewriteModuleImportsOptions): Promise<{
	code: string;
	dependencies: string[];
}> {
	const normalizedSource = path.resolve(options.sourcePath);
	const dependencies = new Set<string>();
	const sites: SpecifierSite[] = [];

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
				sites.push({ literal, declaration: node });
			}
		}

		if (node.type === 'ImportExpression') {
			const literal = readStringLiteral(node.source);
			if (literal) {
				sites.push({ literal });
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
	const resolvedSpecifiers = await Promise.all(
		sites.map((site) =>
			resolveImportSpecifier({
				specifier: site.literal.value,
				sourcePath: normalizedSource,
				srcDir: options.srcDir,
				projectRoot: options.projectRoot,
				extraModuleRoots: options.extraModuleRoots,
				resolveVendorImport: options.resolveVendorImport,
				dependencies,
			}),
		),
	);
	for (const [index, site] of sites.entries()) {
		const resolved = resolvedSpecifiers[index];
		if (!resolved) {
			continue;
		}

		const quote = options.code[site.literal.start] === "'" ? "'" : '"';
		const quotedSpecifier = `${quote}${resolved.specifier}${quote}`;
		const interop =
			resolved.commonJs && site.declaration
				? rewriteCommonJsDeclaration(site.declaration, quotedSpecifier, index)
				: undefined;
		if (interop) {
			edits.push(interop);
			continue;
		}
		if (resolved.specifier === site.literal.value) {
			continue;
		}

		edits.push({ start: site.literal.start, end: site.literal.end, replacement: quotedSpecifier });
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
	resolveVendorImport: (specifier: string) => Promise<VendorImport>;
	dependencies: Set<string>;
}): Promise<ResolvedSpecifier | undefined> {
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
		return {
			specifier: resolveVersionedDevTransformModuleUrl(options.srcDir, resolvedPath, options.extraModuleRoots),
			commonJs: false,
		};
	}

	const vendor = await options.resolveVendorImport(options.specifier);
	return { specifier: vendor.url, commonJs: vendor.commonJs };
}

const IDENTIFIER_NAME = /^[$A-Z_a-z][$\w]*$/u;

/** A name as written in an export clause or a destructuring key; a name that is not an identifier is quoted. */
function toExportName(name: string): string {
	return IDENTIFIER_NAME.test(name) ? name : JSON.stringify(name);
}

function readName(node: unknown): string | undefined {
	if (!isRecord(node)) return undefined;
	if (node.type === 'Identifier' && typeof node.name === 'string') return node.name;
	return readStringLiteral(node)?.value;
}

/**
 * Rewrites an import or re-export of a CommonJS vendor so its named bindings read the vendor's default export.
 *
 * @remarks
 * Rolldown emits a CommonJS entry as `export default module.exports` and no named exports, so a named import of it
 * would fail to link. The declaration becomes a default import plus a destructuring, which is how Node reads
 * CommonJS from ESM: `default` names `module.exports` itself, and a namespace holds its properties plus `default`.
 * The names are read once, when the module evaluates; CommonJS has no live bindings. A side-effect import, a
 * default-only import, `export * from` and `import()` keep their form with the vendor URL, so `export *` re-exports
 * nothing and `import()` resolves to a namespace with only `default`.
 */
function rewriteCommonJsDeclaration(
	declaration: Record<string, unknown>,
	quotedSpecifier: string,
	index: number,
): ImportEdit | undefined {
	if (typeof declaration.start !== 'number' || typeof declaration.end !== 'number') return undefined;
	const local = `__eco_cjs_${index}`;
	const statements =
		declaration.type === 'ImportDeclaration'
			? rewriteCommonJsImport(declaration, quotedSpecifier, local)
			: declaration.type === 'ExportNamedDeclaration' || declaration.type === 'ExportAllDeclaration'
				? rewriteCommonJsReExport(declaration, quotedSpecifier, local)
				: undefined;
	return statements
		? { start: declaration.start, end: declaration.end, replacement: statements.join(' ') }
		: undefined;
}

function readSpecifiers(declaration: Record<string, unknown>): Record<string, unknown>[] {
	return Array.isArray(declaration.specifiers) ? declaration.specifiers.filter(isRecord) : [];
}

/** `import D, { a, b as c, default as d }` or `import * as ns` from a CommonJS vendor, read from its default export. */
function rewriteCommonJsImport(
	declaration: Record<string, unknown>,
	quotedSpecifier: string,
	local: string,
): string[] | undefined {
	const specifiers = readSpecifiers(declaration);
	const defaultSpecifier = specifiers.find((specifier) => specifier.type === 'ImportDefaultSpecifier');
	const others = specifiers.filter((specifier) => specifier !== defaultSpecifier);
	if (others.length === 0) return undefined;
	const moduleExports = readName(defaultSpecifier?.local) ?? local;
	const statements = [`import ${moduleExports} from ${quotedSpecifier};`];
	const properties: string[] = [];
	for (const specifier of others) {
		const localName = readName(specifier.local);
		if (!localName) return undefined;
		const imported =
			specifier.type === 'ImportNamespaceSpecifier' ? undefined : (readName(specifier.imported) ?? localName);
		if (imported === undefined) {
			statements.push(`const ${localName} = { ...${moduleExports}, default: ${moduleExports} };`);
		} else if (imported === 'default') {
			statements.push(`const ${localName} = ${moduleExports};`);
		} else {
			properties.push(imported === localName ? localName : `${toExportName(imported)}: ${localName}`);
		}
	}
	if (properties.length > 0) statements.push(`const { ${properties.join(', ')} } = ${moduleExports};`);
	return statements;
}

/** `export { a, b as c } from` or `export * as ns from` a CommonJS vendor, read from its default export. */
function rewriteCommonJsReExport(
	declaration: Record<string, unknown>,
	quotedSpecifier: string,
	local: string,
): string[] | undefined {
	const statements = [`import ${local} from ${quotedSpecifier};`];
	if (declaration.type === 'ExportAllDeclaration') {
		const exported = readName(declaration.exported);
		if (!exported) return undefined;
		statements.push(
			`const ${local}_ns = { ...${local}, default: ${local} };`,
			`export { ${local}_ns as ${toExportName(exported)} };`,
		);
		return statements;
	}
	for (const [position, specifier] of readSpecifiers(declaration).entries()) {
		const localName = readName(specifier.local);
		const exportedName = readName(specifier.exported) ?? localName;
		if (!localName || !exportedName) return undefined;
		const binding = `${local}_${position}`;
		const value = localName === 'default' ? local : `${local}[${JSON.stringify(localName)}]`;
		statements.push(`const ${binding} = ${value};`, `export { ${binding} as ${toExportName(exportedName)} };`);
	}
	return statements;
}
