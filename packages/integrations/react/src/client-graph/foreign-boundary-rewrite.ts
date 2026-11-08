/**
 * Source rewrite that gives a React module the boundary of every Eco Component another Integration owns.
 */

import { parseModuleSource, resolveProjectModulePath } from '@ecopages/core/build';
import { FOREIGN_BOUNDARY_PACKAGE } from '../bundling/bootstrap-package-paths.ts';
import { toRealPath } from './foreign-jsx-reach.ts';

const HELPER_BINDING = '__ecoForeignBoundary';
const NAMESPACE_HELPER_BINDING = '__ecoForeignBoundaryNamespace';

export type ForeignBoundaryRewriteOptions = {
	projectRoot: string;
	/** Whether `filePath` belongs to an Integration other than React. */
	isForeignFile: (filePath: string) => boolean;
};

type SourceEdit = { start: number; end: number; replacement: string };

function moduleName(node: any): string {
	return node.type === 'Identifier' ? node.name : String(node.value);
}

function isForeignSource(node: any, importer: string, options: ForeignBoundaryRewriteOptions): boolean {
	const resolved = resolveProjectModulePath(options.projectRoot, importer, node.source.value as string, {
		preserveBarrel: true,
	});
	return resolved !== undefined && options.isForeignFile(toRealPath(resolved));
}

/**
 * Rewrites an import declaration of a foreign module so each value binding goes through the boundary.
 *
 * @remarks
 * The declaration keeps its line: the replacement holds no newline, so positions after it stay valid.
 */
function rewriteImport(node: any, source: string, uid: () => string): string | undefined {
	if (node.importKind === 'type' || !node.specifiers?.length) return undefined;
	const imports: string[] = [];
	const bindings: string[] = [];
	for (const specifier of node.specifiers) {
		if (specifier.importKind === 'type') {
			imports.push(source.slice(specifier.start, specifier.end));
			continue;
		}
		const local = specifier.local.name as string;
		const temporary = `__eco_foreign_${uid()}`;
		if (specifier.type === 'ImportNamespaceSpecifier') {
			bindings.push(`const ${local} = ${NAMESPACE_HELPER_BINDING}(${temporary});`);
			bindings.unshift(`import * as ${temporary} from ${JSON.stringify(node.source.value)};`);
			continue;
		}
		const imported = specifier.type === 'ImportDefaultSpecifier' ? 'default' : moduleName(specifier.imported);
		imports.push(`${JSON.stringify(imported)} as ${temporary}`);
		bindings.push(`const ${local} = ${HELPER_BINDING}(${temporary});`);
	}
	const named =
		imports.length > 0 ? `import { ${imports.join(', ')} } from ${JSON.stringify(node.source.value)};` : '';
	return `${named} ${bindings.join(' ')}`;
}

/** Rewrites `export { X } from` of a foreign module to export the boundary of `X`. */
function rewriteReexport(node: any, uid: () => string): string | undefined {
	if (node.exportKind === 'type' || !node.specifiers?.length) return undefined;
	const imports: string[] = [];
	const bindings: string[] = [];
	const exports: string[] = [];
	for (const specifier of node.specifiers) {
		if (specifier.exportKind === 'type') continue;
		const id = uid();
		imports.push(`${JSON.stringify(moduleName(specifier.local))} as __eco_foreign_${id}`);
		bindings.push(`const __eco_foreign_boundary_${id} = ${HELPER_BINDING}(__eco_foreign_${id});`);
		exports.push(`__eco_foreign_boundary_${id} as ${JSON.stringify(moduleName(specifier.exported))}`);
	}
	if (imports.length === 0) return undefined;
	return `import { ${imports.join(', ')} } from ${JSON.stringify(node.source.value)}; ${bindings.join(' ')} export { ${exports.join(', ')} };`;
}

/**
 * Rewrites the static imports and re-exports of foreign-owned modules in `code`, or returns `undefined`.
 *
 * @remarks
 * A module without such an import is not touched: the caller gets `undefined`, so a React-only module compiles
 * to the same output as before and ships no boundary code. A module already rewritten is returned as `undefined`
 * too, since a build can hold more than one instance of the plugin. A namespace import is wrapped in a proxy, and
 * `export *` and dynamic `import()` of a foreign module are left as they are.
 */
export function rewriteForeignImports(
	code: string,
	filePath: string,
	options: ForeignBoundaryRewriteOptions,
): string | undefined {
	if (!/\b(?:import|export)\b/.test(code) || code.includes(FOREIGN_BOUNDARY_PACKAGE)) return undefined;
	const lang = /\.(?:mdx?)$/.test(filePath) ? 'jsx' : undefined;
	const { program } = parseModuleSource(filePath, code, lang ? { lang } : {});
	let counter = 0;
	const uid = () => String(counter++);
	const edits: SourceEdit[] = [];
	for (const node of program.body as any[]) {
		const isImport = node.type === 'ImportDeclaration';
		const isReexport = node.type === 'ExportNamedDeclaration' && node.source;
		if (!isImport && !isReexport) continue;
		if (!isForeignSource(node, filePath, options)) continue;
		const replacement = isImport ? rewriteImport(node, code, uid) : rewriteReexport(node, uid);
		if (replacement !== undefined) edits.push({ start: node.start, end: node.end, replacement });
	}
	if (edits.length === 0) return undefined;

	let rewritten = code;
	for (const edit of edits.reverse()) {
		rewritten = `${rewritten.slice(0, edit.start)}${edit.replacement}${rewritten.slice(edit.end)}`;
	}
	const helpers =
		`import { foreignBoundary as ${HELPER_BINDING}, foreignBoundaryNamespace as ${NAMESPACE_HELPER_BINDING} } ` +
		`from ${JSON.stringify(FOREIGN_BOUNDARY_PACKAGE)};`;
	return `${helpers}${rewritten}`;
}
