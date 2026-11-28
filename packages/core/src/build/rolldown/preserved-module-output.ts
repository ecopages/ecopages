import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { fromRolldownModuleId } from './rolldown-module-id.ts';

type AstNode = { type: string; start: number; end: number; [key: string]: unknown };

/** A file the post-processing adds to the bundle. */
export type PreservedModuleAsset = { fileName: string; source: string };

/** A chunk of a Rolldown bundle, as far as the post-processing reads and changes it. */
export type PreservedModuleChunk = {
	fileName: string;
	code: string;
	facadeModuleId: string | null;
	dynamicImports: string[];
};

function isNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

function nodes(value: unknown): AstNode[] {
	return Array.isArray(value) ? value.filter(isNode) : [];
}

function nameOf(node: unknown): string | undefined {
	if (!isNode(node)) return undefined;
	return (node.name ?? node.value) as string | undefined;
}

function parseModule(chunk: PreservedModuleChunk): AstNode[] {
	return nodes(parseSync(chunk.fileName, chunk.code, { sourceType: 'module', lang: 'js' }).program.body);
}

function countWord(code: string, word: string): number {
	return code.split(new RegExp(`(?<![\\w$])${word.replaceAll('$', '\\$')}(?![\\w$])`, 'u')).length - 1;
}

function removeStatement(code: MagicString, source: string, node: AstNode): void {
	let end = node.end;
	while (source[end] === '\n' || source[end] === ' ') end++;
	code.remove(node.start, end);
}

/**
 * The name of the namespace object a module file declares for the modules that read it as a value, with the
 * statement that declares it.
 *
 * @remarks
 * Rolldown writes `var x_exports = __exportAll({...})` and exports it when another module uses `import * as ns`
 * as a value, such as `Object.keys(ns)`. A file is recognised only when that name appears nowhere else in it than
 * the declaration and the export, so a module that uses its own namespace is left alone.
 */
function findNamespaceDeclaration(
	chunk: PreservedModuleChunk,
	body: AstNode[],
): { declaration: AstNode; local: string; exported: string; exportStatement: AstNode } | undefined {
	for (const statement of body) {
		if (statement.type !== 'VariableDeclaration') continue;
		const declarator = nodes(statement.declarations)[0];
		const init = declarator?.init;
		if (!isNode(init) || init.type !== 'CallExpression' || nameOf(init.callee) !== '__exportAll') continue;
		const local = nameOf(declarator?.id);
		if (!local || countWord(chunk.code, local) !== 2) continue;
		for (const exportStatement of body) {
			if (exportStatement.type !== 'ExportNamedDeclaration' || exportStatement.source) continue;
			const specifier = nodes(exportStatement.specifiers).find((candidate) => nameOf(candidate.local) === local);
			if (specifier) {
				return {
					declaration: statement,
					local,
					exported: nameOf(specifier.exported) ?? local,
					exportStatement,
				};
			}
		}
	}
	return undefined;
}

/**
 * Removes the namespace objects that modules read as values from the files of the modules that own them, and makes
 * the readers import the module's own namespace instead.
 *
 * @remarks
 * Rolldown adds `x_exports` and an `__exportAll` import to a module's file when a later module reads its
 * namespace, so the file of a module that a browser already loaded would change. The module's real namespace is the
 * same object, with the same keys, so a reader that imports it with `import * as` behaves as before and the file
 * stays as it was.
 */
function useNativeNamespaces(chunks: PreservedModuleChunk[]): void {
	const owners = new Map<string, { local: string; exported: string }>();
	for (const chunk of chunks) {
		const body = parseModule(chunk);
		const found = findNamespaceDeclaration(chunk, body);
		if (!found) continue;
		owners.set(chunk.fileName, found);
		const edited = new MagicString(chunk.code);
		removeStatement(edited, chunk.code, found.declaration);
		const specifiers = nodes(found.exportStatement.specifiers);
		if (specifiers.length === 1) {
			removeStatement(edited, chunk.code, found.exportStatement);
		} else {
			const index = specifiers.findIndex((specifier) => nameOf(specifier.local) === found.local);
			const specifier = specifiers[index]!;
			const next = specifiers[index + 1];
			if (next) edited.remove(specifier.start, next.start);
			else edited.remove(specifiers[index - 1]!.end, specifier.end);
		}
		chunk.code = removeUnusedHelperImport(edited.toString(), chunk, '__exportAll');
	}

	for (const chunk of chunks) {
		const edited = new MagicString(chunk.code);
		let changed = false;
		for (const statement of parseModule(chunk)) {
			if (statement.type !== 'ImportDeclaration') continue;
			const source = nameOf(statement.source);
			const owner = source === undefined ? undefined : owners.get(source.replace(/^\.\//u, ''));
			if (!owner) continue;
			const specifiers = nodes(statement.specifiers);
			const namespace = specifiers.find((specifier) => nameOf(specifier.imported) === owner.exported);
			if (!namespace) continue;
			const local = nameOf(namespace.local)!;
			const rest = specifiers.filter((specifier) => specifier !== namespace);
			const kept = rest.map((specifier) => chunk.code.slice(specifier.start, specifier.end));
			const quoted = JSON.stringify(source);
			edited.overwrite(
				statement.start,
				statement.end,
				`${kept.length > 0 ? `import { ${kept.join(', ')} } from ${quoted};\n` : ''}import * as ${local} from ${quoted};`,
			);
			changed = true;
		}
		if (changed) chunk.code = edited.toString();
	}
}

function removeUnusedHelperImport(code: string, chunk: PreservedModuleChunk, helper: string): string {
	if (countWord(code, helper) !== 1) return code;
	const edited = new MagicString(code);
	for (const statement of nodes(parseSync(chunk.fileName, code, { sourceType: 'module', lang: 'js' }).program.body)) {
		if (statement.type !== 'ImportDeclaration') continue;
		const specifiers = nodes(statement.specifiers);
		const index = specifiers.findIndex((specifier) => nameOf(specifier.local) === helper);
		if (index === -1) continue;
		if (specifiers.length === 1) removeStatement(edited, code, statement);
		else {
			const specifier = specifiers[index]!;
			const next = specifiers[index + 1];
			if (next) edited.remove(specifier.start, next.start);
			else edited.remove(specifiers[index - 1]!.end, specifier.end);
		}
	}
	return edited.toString();
}

function findDynamicImportSources(chunk: PreservedModuleChunk): AstNode[] {
	const found: AstNode[] = [];
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (!isNode(value)) return;
		if (value.type === 'ImportExpression' && isNode(value.source)) found.push(value.source);
		for (const child of Object.values(value)) {
			if (typeof child === 'object' && child !== null) visit(child);
		}
	};
	visit(parseModule(chunk));
	return found;
}

/**
 * Stops the file of a CommonJS module that is not an entry from running the module when it loads, and gives each
 * dynamic `import()` of it a file that does.
 *
 * @remarks
 * Rolldown ends the file of a CommonJS module with `export default require_x();`, which runs the module as soon as
 * the file loads. A package that requires a module only when a function runs, or inside a `try` that tolerates a
 * missing one, would run it on import. Without the line the importers call the `require_x` export when the
 * module's code asks, as in a code-split build; the file always exports it, whether or not a `require()` reaches it. A dynamic `import()` reads the default export, so it goes to a
 * sibling file, `<file>~dyn.js`, that imports `require_x` and exports its result as the default; the module
 * file itself is the same whether anything imports it dynamically.
 */
function runCommonJsModulesOnDemand(
	chunks: PreservedModuleChunk[],
	entryFiles: ReadonlySet<string>,
): PreservedModuleAsset[] {
	const requireNames = new Map<string, string>();
	for (const chunk of chunks) {
		if (chunk.facadeModuleId === null || entryFiles.has(fromRolldownModuleId(chunk.facadeModuleId))) continue;
		const run = parseModule(chunk).find(
			(statement) =>
				statement.type === 'ExportDefaultDeclaration' &&
				isNode(statement.declaration) &&
				statement.declaration.type === 'CallExpression' &&
				nameOf((statement.declaration as AstNode).callee)?.startsWith('require_'),
		);
		if (!run) continue;
		const requireName = nameOf((run.declaration as AstNode).callee)!;
		requireNames.set(chunk.fileName, requireName);
		const exportsRequire = parseModule(chunk).some(
			(statement) =>
				statement.type === 'ExportNamedDeclaration' &&
				nodes(statement.specifiers).some((specifier) => nameOf(specifier.local) === requireName),
		);
		const edited = new MagicString(chunk.code);
		removeStatement(edited, chunk.code, run);
		chunk.code = exportsRequire
			? edited.toString()
			: `${edited.toString().trimEnd()}\nexport { ${requireName} };\n`;
	}

	const assets = new Map<string, PreservedModuleAsset>();
	for (const chunk of chunks) {
		if (!chunk.dynamicImports.some((file) => requireNames.has(file))) continue;
		const edited = new MagicString(chunk.code);
		for (const source of findDynamicImportSources(chunk)) {
			const target = nameOf(source)?.replace(/^\.\//u, '');
			const requireName = target === undefined ? undefined : requireNames.get(target);
			if (target === undefined || requireName === undefined) continue;
			const wrapper = `${target.slice(0, -'.js'.length)}~dyn.js`;
			edited.overwrite(source.start, source.end, JSON.stringify(`./${wrapper}`));
			assets.set(wrapper, {
				fileName: wrapper,
				source: `import { ${requireName} } from ${JSON.stringify(`./${target}`)};\nexport default ${requireName}();\n`,
			});
		}
		chunk.code = edited.toString();
	}
	return [...assets.values()];
}

/**
 * Rewrites the files of a build that keeps each module as its own file, so the file of a module is the same
 * whichever modules import it.
 *
 * @param entryFiles - The ids of the modules the build was asked for. A CommonJS entry keeps the line that runs it.
 * @returns The files to add to the bundle.
 */
export function normalizePreservedModuleOutput(
	chunks: PreservedModuleChunk[],
	entryFiles: ReadonlySet<string>,
): PreservedModuleAsset[] {
	useNativeNamespaces(chunks);
	return runCommonJsModulesOnDemand(chunks, entryFiles);
}
