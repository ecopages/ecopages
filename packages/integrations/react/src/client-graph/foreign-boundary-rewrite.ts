/**
 * Source rewrite that gives a React module the boundary of every Eco Component another Integration owns.
 */

import { fileSystem } from '@ecopages/file-system';
import { parseModuleSource, resolveProjectModulePath } from '@ecopages/core/build';
import { FOREIGN_BOUNDARY_PACKAGE } from '../bundling/bootstrap-package-paths.ts';
import { toRealPath } from './foreign-jsx-reach.ts';
import { collectLexicalDeclarations, walkScopedReferences } from './scope-walk.ts';

const HELPER_BINDING = '__ecoForeignBoundary';
const NAMESPACE_HELPER_BINDING = '__ecoForeignBoundaryNamespace';

/** The module variant a React graph imports of a module that another graph also uses and that imports a foreign Component. */
export const REACT_BOUNDARY_VARIANT = 'react-boundary';
const VARIANT_QUERY = `eco-variant=${REACT_BOUNDARY_VARIANT}`;

/** Whether the module id or specifier names the React boundary variant of its module. */
export function isReactBoundaryVariant(idOrSpecifier: string): boolean {
	return idOrSpecifier.includes(VARIANT_QUERY);
}

export type ForeignBoundaryRewriteOptions = {
	projectRoot: string;
	/** Whether `filePath` belongs to an Integration other than React. */
	isForeignFile: (filePath: string) => boolean;
	/**
	 * Whether another module graph also uses `filePath`, so React needs its own compiled form of it.
	 *
	 * @remarks
	 * A module has one compiled form per id. A shared module that imports a foreign Component would otherwise give
	 * the other graph a React boundary, so React imports it under a variant id and the other graph keeps the plain one.
	 */
	isSharedFile?: (filePath: string) => boolean;
};

type SourceEdit = { start: number; end: number; replacement: string };

function moduleName(node: any): string {
	return node.type === 'Identifier' ? node.name : String(node.value);
}

const RE_EXPORT = /\bexport\s*(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s*)?from\b/;
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;

/**
 * Follows the `export { a as b } from` and `export * from` chains of project modules to the file that declares
 * an export, so a barrel that re-exports a foreign Component counts as foreign for that name.
 *
 * @remarks
 * The barrel itself is never rewritten: it may be shared with an entry that needs the Component, and each React
 * import site decides for its own bindings. A file without a re-export is not parsed.
 */
class ForeignExports {
	private readonly options: ForeignBoundaryRewriteOptions;
	private readonly reexports = new Map<string, any[]>();

	constructor(options: ForeignBoundaryRewriteOptions) {
		this.options = options;
	}

	resolve(importer: string, specifier: string): string | undefined {
		const resolved = resolveProjectModulePath(this.options.projectRoot, importer, specifier, {
			preserveBarrel: true,
		});
		return resolved ? toRealPath(resolved) : undefined;
	}

	private getReexports(filePath: string): any[] {
		let nodes = this.reexports.get(filePath);
		if (!nodes) {
			nodes = [];
			this.reexports.set(filePath, nodes);
			if (SOURCE_FILE.test(filePath) && fileSystem.exists(filePath)) {
				const source = fileSystem.readFileSync(filePath);
				if (RE_EXPORT.test(source)) {
					const { program } = parseModuleSource(filePath, source);
					nodes.push(
						...(program.body as any[]).filter(
							(node) =>
								(node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
								node.source &&
								node.exportKind !== 'type',
						),
					);
				}
			}
		}
		return nodes;
	}

	private readonly importing = new Map<string, boolean>();
	private readonly imports = new Map<string, any[]>();

	private getImports(filePath: string): any[] {
		let nodes = this.imports.get(filePath);
		if (!nodes) {
			nodes = [];
			this.imports.set(filePath, nodes);
			if (SOURCE_FILE.test(filePath) && fileSystem.exists(filePath)) {
				const source = fileSystem.readFileSync(filePath);
				if (/\b(?:import|export)\b/.test(source)) {
					const { program } = parseModuleSource(filePath, source);
					nodes.push(
						...(program.body as any[]).filter(
							(node) =>
								(node.type === 'ImportDeclaration' ||
									node.type === 'ExportNamedDeclaration' ||
									node.type === 'ExportAllDeclaration') &&
								node.source &&
								(node.importKind ?? node.exportKind) !== 'type',
						),
					);
				}
			}
		}
		return nodes;
	}

	/** Whether `filePath` imports a foreign Component, directly or through a module that does. */
	importsForeign(filePath: string, seen = new Set<string>()): boolean {
		const known = this.importing.get(filePath);
		if (known !== undefined) return known;
		if (seen.has(filePath)) return false;
		seen.add(filePath);
		let result = false;
		for (const node of this.getImports(filePath)) {
			const target = this.resolve(filePath, node.source.value as string);
			if (!target) continue;
			if (node.type === 'ImportDeclaration' && this.valueImportOf(node, target)) {
				result = true;
				break;
			}
			if (!this.options.isForeignFile(target) && this.importsForeign(target, seen)) {
				result = true;
				break;
			}
		}
		this.importing.set(filePath, result);
		return result;
	}

	/** Whether an import declaration binds at least one value that `target` declares as foreign. */
	valueImportOf(node: any, target: string): boolean {
		return (node.specifiers ?? []).some((specifier: any) => {
			if (specifier.importKind === 'type') return false;
			if (specifier.type === 'ImportNamespaceSpecifier') return this.isForeign(target, undefined);
			const imported = specifier.type === 'ImportDefaultSpecifier' ? 'default' : moduleName(specifier.imported);
			return this.isForeign(target, imported) || this.isForeignNamespace(target, imported);
		});
	}

	/** Whether React imports `target` under the variant id: another graph shares it and it imports a foreign Component. */
	needsVariant(target: string): boolean {
		return (
			!this.options.isForeignFile(target) &&
			this.options.isSharedFile?.(target) === true &&
			this.importsForeign(target)
		);
	}

	private readonly declared = new Map<string, { names: Set<string>; stars: string[] } | undefined>();

	private getDeclaredExports(filePath: string): { names: Set<string>; stars: string[] } | undefined {
		if (this.declared.has(filePath)) return this.declared.get(filePath);
		this.declared.set(filePath, undefined);
		if (!SOURCE_FILE.test(filePath) || !fileSystem.exists(filePath)) return undefined;
		const { program } = parseModuleSource(filePath, fileSystem.readFileSync(filePath));
		const names = new Set<string>();
		const stars: string[] = [];
		for (const node of program.body as any[]) {
			if (node.type === 'ExportDefaultDeclaration') {
				names.add('default');
			} else if (node.type === 'ExportNamedDeclaration' && node.exportKind !== 'type') {
				collectLexicalDeclarations(node, names);
				for (const specifier of node.specifiers ?? []) names.add(moduleName(specifier.exported));
			} else if (node.type === 'ExportAllDeclaration' && node.exportKind !== 'type') {
				if (node.exported) names.add(moduleName(node.exported));
				else stars.push(node.source.value as string);
			}
		}
		const result = { names, stars };
		this.declared.set(filePath, result);
		return result;
	}

	/**
	 * Whether the module `filePath` exports `name` itself or through an `export *`.
	 *
	 * @remarks
	 * A file that cannot be read as source answers `true`, so an unknown export keeps counting as foreign.
	 */
	private declaresExport(filePath: string, name: string, seen = new Set<string>()): boolean {
		if (seen.has(filePath)) return false;
		seen.add(filePath);
		const declared = this.getDeclaredExports(filePath);
		if (!declared) return true;
		if (declared.names.has(name)) return true;
		if (name === 'default') return false;
		return declared.stars.some((star) => {
			const target = this.resolve(filePath, star);
			return target === undefined || this.declaresExport(target, name, seen);
		});
	}

	/** Whether `export * from target` brings in the foreign export `name`: a foreign target must declare it, and `export *` never carries `default`. */
	private starExportIsForeign(target: string, name: string | undefined, seen: Set<string>): boolean {
		if (name === 'default') return false;
		if (name !== undefined && this.options.isForeignFile(target)) return this.declaresExport(target, name);
		return this.isForeign(target, name, seen);
	}

	private reexportIsForeignNamespace(
		node: any,
		target: string,
		name: string,
		explicit: boolean,
		seen: Set<string>,
	): boolean {
		if (node.type === 'ExportAllDeclaration') {
			if (node.exported) return moduleName(node.exported) === name && this.isForeign(target, undefined);
			return !explicit && name !== 'default' && this.isForeignNamespace(target, name, seen);
		}
		return node.specifiers.some(
			(specifier: any) =>
				specifier.exportKind !== 'type' &&
				moduleName(specifier.exported) === name &&
				this.isForeignNamespace(target, moduleName(specifier.local), seen),
		);
	}

	/**
	 * Whether the export `name` of `filePath` is a namespace of a foreign file, through `export * as name from`.
	 *
	 * @remarks
	 * The binding is a module namespace object, so React wraps it in the namespace proxy: a member that is a foreign
	 * Eco Component gets its boundary, and any other member comes back unchanged.
	 */
	isForeignNamespace(filePath: string, name: string, seen = new Set<string>()): boolean {
		if (this.options.isForeignFile(filePath) || seen.has(filePath)) return false;
		seen.add(filePath);
		const explicit = this.getDeclaredExports(filePath)?.names.has(name) === true;
		for (const node of this.getReexports(filePath)) {
			const target = this.resolve(filePath, node.source.value as string);
			if (target && this.reexportIsForeignNamespace(node, target, name, explicit, seen)) return true;
		}
		return false;
	}

	private reexportIsForeign(
		node: any,
		target: string,
		name: string | undefined,
		explicit: boolean,
		seen: Set<string>,
	): boolean {
		if (node.type === 'ExportAllDeclaration') {
			const isStar = node.exported === null || node.exported === undefined;
			return isStar && !explicit && this.starExportIsForeign(target, name, seen);
		}
		return node.specifiers.some(
			(specifier: any) =>
				specifier.exportKind !== 'type' &&
				(name === undefined || moduleName(specifier.exported) === name) &&
				this.isForeign(target, moduleName(specifier.local), seen),
		);
	}

	/** Whether the export `name` of `filePath` is declared by a foreign file; `undefined` asks about any export. */
	isForeign(filePath: string, name: string | undefined, seen = new Set<string>()): boolean {
		if (this.options.isForeignFile(filePath)) return true;
		if (seen.has(filePath)) return false;
		seen.add(filePath);
		const explicit = name !== undefined && this.getDeclaredExports(filePath)?.names.has(name) === true;
		for (const node of this.getReexports(filePath)) {
			const target = this.resolve(filePath, node.source.value as string);
			if (target && this.reexportIsForeign(node, target, name, explicit, seen)) return true;
		}
		return false;
	}
}

/** The specifier an import is written with: the variant id when `target` needs one. */
function importSourceOf(node: any, target: string, foreignExports: ForeignExports): string {
	const specifier = node.source.value as string;
	return foreignExports.needsVariant(target) && !specifier.includes('?')
		? `${specifier}?${VARIANT_QUERY}`
		: specifier;
}

/** The helper that wraps the export `imported` of `target`, or `undefined` when it is not foreign. */
function boundaryHelperOf(foreignExports: ForeignExports, target: string, imported: string): string | undefined {
	if (foreignExports.isForeign(target, imported)) return HELPER_BINDING;
	return foreignExports.isForeignNamespace(target, imported) ? NAMESPACE_HELPER_BINDING : undefined;
}

/**
 * Rewrites an import declaration so each binding that resolves to a foreign Component goes through the boundary.
 *
 * @remarks
 * The declaration keeps its line: the replacement holds no newline, so positions after it stay valid. Only a
 * binding the module reads as a value is wrapped; a type or an unused binding keeps its plain import, so the
 * bundler drops it as it would without the rewrite.
 */
function rewriteImport(
	node: any,
	source: string,
	filePath: string,
	foreignExports: ForeignExports,
	uid: () => string,
	valueReads: ReadonlySet<string>,
): string | undefined {
	if (node.importKind === 'type' || !node.specifiers?.length) return undefined;
	const target = foreignExports.resolve(filePath, node.source.value as string);
	if (!target) return undefined;
	const from = JSON.stringify(importSourceOf(node, target, foreignExports));
	const imports: string[] = [];
	const extra: string[] = [];
	const bindings: string[] = [];
	let foreign = false;
	for (const specifier of node.specifiers) {
		if (specifier.importKind === 'type') {
			imports.push(source.slice(specifier.start, specifier.end));
			continue;
		}
		const local = specifier.local.name as string;
		if (specifier.type === 'ImportNamespaceSpecifier') {
			if (!valueReads.has(local) || !foreignExports.isForeign(target, undefined)) {
				extra.push(`import * as ${local} from ${from};`);
				continue;
			}
			foreign = true;
			const temporary = `__eco_foreign_${uid()}`;
			extra.push(`import * as ${temporary} from ${from};`);
			bindings.push(`const ${local} = ${NAMESPACE_HELPER_BINDING}(${temporary});`);
			continue;
		}
		const imported = specifier.type === 'ImportDefaultSpecifier' ? 'default' : moduleName(specifier.imported);
		const wrapper = valueReads.has(local) ? boundaryHelperOf(foreignExports, target, imported) : undefined;
		if (!wrapper) {
			imports.push(`${JSON.stringify(imported)} as ${local}`);
			continue;
		}
		foreign = true;
		const temporary = `__eco_foreign_${uid()}`;
		imports.push(`${JSON.stringify(imported)} as ${temporary}`);
		bindings.push(`const ${local} = ${wrapper}(${temporary});`);
	}
	if (!foreign) return undefined;
	const named = imports.length > 0 ? `import { ${imports.join(', ')} } from ${from};` : '';
	return [named, ...extra, ...bindings].filter(Boolean).join(' ');
}

/** The edit one top-level node needs: wrapped bindings, or the variant id for a shared module that reaches a foreign Component. */
function planEdit(
	node: any,
	code: string,
	filePath: string,
	foreignExports: ForeignExports,
	uid: () => string,
	valueReads: ReadonlySet<string>,
): SourceEdit | undefined {
	if (!node.source || (node.importKind ?? node.exportKind) === 'type') return undefined;
	const replacement =
		node.type === 'ImportDeclaration'
			? rewriteImport(node, code, filePath, foreignExports, uid, valueReads)
			: undefined;
	if (replacement !== undefined) return { start: node.start, end: node.end, replacement };
	const specifier = node.source.value as string;
	if (specifier.includes('?')) return undefined;
	const target = foreignExports.resolve(filePath, specifier);
	if (!target || !foreignExports.needsVariant(target)) return undefined;
	return {
		start: node.source.start,
		end: node.source.end,
		replacement: JSON.stringify(`${specifier}?${VARIANT_QUERY}`),
	};
}

/**
 * Rewrites the static imports of foreign-owned Components in `code`, barrels that re-export them included, or
 * returns `undefined`.
 *
 * @remarks
 * A module without such an import is not touched: the caller gets `undefined`, so a React-only module compiles
 * to the same output as before and ships no boundary code. A module already rewritten is returned as `undefined`
 * too, since a build can hold more than one instance of the plugin. A namespace import is wrapped in a proxy.
 * Dynamic `import()` of a foreign module is left as it is.
 */
export function rewriteForeignImports(
	code: string,
	filePath: string,
	options: ForeignBoundaryRewriteOptions,
): string | undefined {
	if (!/\bimport\b|\bexport\b/.test(code) || code.includes(FOREIGN_BOUNDARY_PACKAGE)) return undefined;
	const lang = /\.(?:mdx?)$/.test(filePath) ? 'jsx' : undefined;
	const { program } = parseModuleSource(filePath, code, lang ? { lang } : {});
	let counter = 0;
	const uid = () => String(counter++);
	const foreignExports = new ForeignExports(options);
	const valueReads = new Set<string>();
	walkScopedReferences(program.body, { onReference: (name) => valueReads.add(name) });
	const edits: SourceEdit[] = [];
	for (const node of program.body as any[]) {
		const edit = planEdit(node, code, filePath, foreignExports, uid, valueReads);
		if (edit) edits.push(edit);
	}
	if (edits.length === 0) return undefined;

	let rewritten = code;
	for (const edit of edits.reverse()) {
		rewritten = `${rewritten.slice(0, edit.start)}${edit.replacement}${rewritten.slice(edit.end)}`;
	}
	if (!rewritten.includes(HELPER_BINDING)) return rewritten;
	const helpers =
		`import { foreignBoundary as ${HELPER_BINDING}, foreignBoundaryNamespace as ${NAMESPACE_HELPER_BINDING} } ` +
		`from ${JSON.stringify(FOREIGN_BOUNDARY_PACKAGE)};`;
	return `${helpers}${rewritten}`;
}
