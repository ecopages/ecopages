import { path } from '@ecopages/file-system/path';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import { RESOLVED_ASSETS_VENDORS_DIR } from '../../constants.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import { rewriteVendorSpecifiers, type VendorImport } from './dev-transform-import-rewriter.ts';
import { escapeRegExp } from '../../utils/regex-escaping.ts';

const SCRIPT_MODULE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const VENDOR_URL_PREFIX = `/${RESOLVED_ASSETS_VENDORS_DIR}/`;
const VENDOR_URL = new RegExp(`^${escapeRegExp(VENDOR_URL_PREFIX)}`, 'u');
const DEPENDENCY_SHIM_PREFIX = 'ecopages-vendor-dependency:';
const DEPENDENCY_SHIM = new RegExp(`^${escapeRegExp(DEPENDENCY_SHIM_PREFIX)}`, 'u');
const SHIM_MODULE_PREFIX = '\0';
const JSX_SHIM_PREFIX = 'ecopages-vendor-jsx-runtime:';
const JSX_SHIM_MODULE = new RegExp(`^${escapeRegExp(`\0${JSX_SHIM_PREFIX}`)}`, 'u');
const JSX_RUNTIME_SPECIFIER = /\/jsx-(?:dev-)?runtime$/u;
const BARE_SPECIFIER = /^[\w@$][^:]*$/u;
const REQUIRE_CALL = /\brequire\s*\(/u;

/** What the build of one package needs to know to leave another package out of its file. */
export type VendorPackageExternalsOptions = {
	/**
	 * The vendor file of a bare specifier that another package owns, or `undefined` when the package that is being
	 * built owns it, or nothing resolves it.
	 */
	resolveDependency: (
		specifier: string,
		importer: string,
	) => (VendorImport & { declaresSideEffects: boolean }) | undefined;
};

function isBareSpecifier(specifier: string): boolean {
	return (
		!specifier.startsWith('.') &&
		!specifier.startsWith('/') &&
		!specifier.startsWith('\0') &&
		!specifier.includes(':')
	);
}

type AstNode = { type: string; start: number; end: number; [key: string]: unknown };

function isNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

/** The `require('literal')` calls of a module, with the span of the call and its literal. */
function findRequireCalls(id: string, code: string): { call: AstNode; specifier: string }[] {
	const program = parseModuleSource(id, code, { sourceType: 'module', lang: 'js' }).program;
	const found: { call: AstNode; specifier: string }[] = [];
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (!isNode(value)) return;
		if (value.type === 'CallExpression' && isNode(value.callee) && value.callee.name === 'require') {
			const callArguments = Array.isArray(value.arguments) ? value.arguments : [];
			const argument = callArguments[0];
			if (callArguments.length === 1 && isNode(argument) && typeof argument.value === 'string') {
				found.push({ call: value, specifier: argument.value });
			}
		}
		for (const child of Object.values(value)) {
			if (typeof child === 'object' && child !== null) visit(child);
		}
	};
	visit(program);
	return found;
}

/** The sources of the `import 'specifier'` statements of a module, which import for what the module does. */
function findSideEffectImports(id: string, code: string): string[] {
	if (!code.includes('import')) return [];
	const extension = path.extname(id);
	const program = parseModuleSource(id, code, {
		sourceType: 'module',
		lang: extension.endsWith('x') ? 'tsx' : extension.includes('ts') ? 'ts' : 'js',
	}).program;
	const found: string[] = [];
	for (const statement of program.body as unknown as AstNode[]) {
		const specifiers = statement.specifiers;
		if (
			statement.type === 'ImportDeclaration' &&
			Array.isArray(specifiers) &&
			specifiers.length === 0 &&
			isNode(statement.source) &&
			typeof statement.source.value === 'string'
		) {
			found.push(statement.source.value);
		}
	}
	return found;
}

/**
 * Keeps the packages that a package imports out of its vendor file, and points each import at their vendor file.
 *
 * @remarks
 * A package's file holds the package and nothing else, so a module that two packages use has one copy and one
 * state. An import of another package becomes its vendor URL, which the build leaves as written, and a vendor file
 * of CommonJS is read from its default export as an app module's import of it is. A CommonJS module cannot
 * import, so its `require('package')` goes through a small module that imports the vendor file and exports the
 * value `require` returns: the module's exports for CommonJS, and the namespace for an ES module.
 *
 * A package that is left out of the file may be one that a bundle would have dropped, such as a server-only package that
 * only code the app never reaches imports. An import of another package is kept only when the module uses one of
 * its bindings or imports it for what it does (`import 'package'`), as a bundle that assumes a package has no effects
 * beyond its exports does.
 */
export function createVendorPackageExternalsPlugin(options: VendorPackageExternalsOptions): EcoBuildPlugin {
	const sideEffectImports = new Set<string>();
	return {
		name: 'ecopages-dev-vendor-package-externals',
		setup(build) {
			build.onResolve({ filter: BARE_SPECIFIER }, (args) => {
				if (!args.importer || !path.isAbsolute(args.importer)) return undefined;
				const dependency = options.resolveDependency(args.path, args.importer);
				if (!dependency) return undefined;
				if (dependency.commonJs) {
					return JSX_RUNTIME_SPECIFIER.test(args.path)
						? { path: `${SHIM_MODULE_PREFIX}${JSX_SHIM_PREFIX}${dependency.url}` }
						: undefined;
				}
				if (dependency.declaresSideEffects) sideEffectImports.add(dependency.url);
				return { path: dependency.url, external: true, sideEffects: sideEffectImports.has(dependency.url) };
			});
			build.onLoad({ filter: JSX_SHIM_MODULE }, (args) => {
				const url = args.path.slice(`${SHIM_MODULE_PREFIX}${JSX_SHIM_PREFIX}`.length);
				return {
					contents: [
						`import runtime from ${JSON.stringify(url)};`,
						'const exports = runtime && runtime.__esModule ? runtime.default : runtime;',
						'export const jsx = exports.jsx;',
						'export const jsxs = exports.jsxs;',
						'export const jsxDEV = exports.jsxDEV;',
						'export const Fragment = exports.Fragment;',
						'',
					].join('\n'),
					loader: 'js',
				};
			});
			build.onResolve({ filter: VENDOR_URL }, (args) => ({
				path: args.path,
				external: true,
				sideEffects: sideEffectImports.has(args.path),
			}));
			build.onResolve({ filter: DEPENDENCY_SHIM }, (args) => ({ path: `${SHIM_MODULE_PREFIX}${args.path}` }));
			build.onLoad(
				{ filter: new RegExp(`^${escapeRegExp(SHIM_MODULE_PREFIX + DEPENDENCY_SHIM_PREFIX)}`, 'u') },
				(args) => {
					const [url, kind] = args.path
						.slice(`${SHIM_MODULE_PREFIX}${DEPENDENCY_SHIM_PREFIX}`.length)
						.split('|');
					return {
						contents: `import * as namespace from ${JSON.stringify(url)};\nexport default ${kind === 'commonjs' ? 'namespace.default' : 'namespace'};\n`,
						loader: 'js',
					};
				},
			);
			build.transform({ filter: SCRIPT_MODULE }, async (code, id) => {
				const importer = path.resolve(id);
				const resolve = (specifier: string): VendorImport | undefined => {
					const dependency = isBareSpecifier(specifier)
						? options.resolveDependency(specifier, importer)
						: undefined;
					return dependency;
				};
				for (const specifier of findSideEffectImports(importer, code)) {
					const dependency = resolve(specifier);
					if (dependency) sideEffectImports.add(dependency.url);
				}
				const resolveCommonJs = (specifier: string): VendorImport | undefined => {
					const dependency = resolve(specifier);
					return dependency?.commonJs ? dependency : undefined;
				};
				let result =
					(await rewriteVendorSpecifiers({ code, sourcePath: importer, resolve: resolveCommonJs })) ?? code;
				if (REQUIRE_CALL.test(result)) {
					const edits = findRequireCalls(importer, result).flatMap(({ call, specifier }) => {
						const vendor = isBareSpecifier(specifier) ? resolve(specifier) : undefined;
						return vendor
							? [
									{
										start: call.start,
										end: call.end,
										replacement: `require(${JSON.stringify(`${DEPENDENCY_SHIM_PREFIX}${vendor.url}|${vendor.commonJs ? 'commonjs' : 'module'}`)}).default`,
									},
								]
							: [];
					});
					for (const edit of edits.sort((left, right) => right.start - left.start)) {
						result = `${result.slice(0, edit.start)}${edit.replacement}${result.slice(edit.end)}`;
					}
				}
				return result === code ? undefined : result;
			});
		},
	};
}
