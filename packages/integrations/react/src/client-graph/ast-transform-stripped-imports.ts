/**
 * Removes the top-level code the browser module does not need once server-only code is gone,
 * and rejects a module whose browser code would still use a binding whose import is stripped.
 */

import type { SourceEdit } from './ast-transform-import-edits.ts';
import { checkPotentialClientRoot } from './reachability-client-roots.ts';
import { getExportedName, isExplicitlyRequestedExport } from './reachability-export-names.ts';
import type { ExplicitlyRequestedExports } from './reachability-export-names.ts';
import { collectLexicalDeclarations, walkScopedReferences } from './scope-walk.ts';

export type StrippedImportCleanupInput = {
	program: any;
	source: string;
	filename: string;
	/** Subtrees the boundary removes; references inside them do not reach the browser. */
	strippedNodes: ReadonlySet<unknown>;
	/** Local names of the imported bindings the boundary removes, mapped to their import specifier. */
	strippedBindings: ReadonlyMap<string, string>;
	/** Import declarations the boundary already edits. */
	editedImports: ReadonlySet<unknown>;
	/** Exports that browser importers of this module are known to use. */
	requestedExports?: ExplicitlyRequestedExports;
};

type UnitKind = 'declaration' | 'exported-declaration' | 'export-specifiers' | 'statement';

type TopLevelUnit = {
	statement: any;
	kind: UnitKind;
	/** Names the statement declares at the top level. */
	names: Set<string>;
	/** Whether the browser module needs the statement whatever references it. */
	isRoot: boolean;
	/** Local names an `export { ... }` statement exposes to browser importers. */
	rootReferences: string[];
	/** First runtime reference to each free name, outside the stripped subtrees. */
	keptReferences: Map<string, any>;
	/** Every free name the statement references, including inside the stripped subtrees. */
	allReferences: Set<string>;
};

const DECLARATION_TYPES = new Set(['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration']);

function isBrowserExport(name: string, input: StrippedImportCleanupInput): boolean {
	return isExplicitlyRequestedExport(name, input.requestedExports);
}

function containsClientRoot(declaration: any): boolean {
	if (declaration.type !== 'VariableDeclaration') return false;
	const roots: unknown[] = [];
	for (const declarator of declaration.declarations) checkPotentialClientRoot(declarator.init, roots);
	return roots.length > 0;
}

function classifyStatement(
	statement: any,
	names: Set<string>,
	input: StrippedImportCleanupInput,
): Pick<TopLevelUnit, 'kind' | 'isRoot' | 'rootReferences'> {
	if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
		const declaration = statement.declaration;
		if (!declaration) {
			const rootReferences = (statement.specifiers ?? [])
				.filter((specifier: any) => isBrowserExport(getExportedName(specifier) ?? '', input))
				.map((specifier: any) => specifier.local?.name as string);
			return { kind: 'export-specifiers', isRoot: false, rootReferences };
		}
		if (DECLARATION_TYPES.has(declaration.type) && !declaration.declare) {
			const isRoot = containsClientRoot(declaration) || [...names].some((name) => isBrowserExport(name, input));
			return { kind: 'exported-declaration', isRoot, rootReferences: [] };
		}
	}
	if (DECLARATION_TYPES.has(statement.type) && !statement.declare) {
		return { kind: 'declaration', isRoot: false, rootReferences: [] };
	}
	return { kind: 'statement', isRoot: true, rootReferences: [] };
}

function createUnit(statement: any, input: StrippedImportCleanupInput): TopLevelUnit {
	const names = new Set<string>();
	collectLexicalDeclarations(statement, names);
	const keptReferences = new Map<string, any>();
	const allReferences = new Set<string>();

	walkScopedReferences(statement, { onReference: (name) => allReferences.add(name) });
	walkScopedReferences(statement, {
		onReference: (name, node) => {
			if (!keptReferences.has(name)) keptReferences.set(name, node);
		},
		onNode: (node) => input.strippedNodes.has(node),
	});

	return { statement, names, keptReferences, allReferences, ...classifyStatement(statement, names, input) };
}

/**
 * Marks the units the browser module needs: the roots and every unit they reference, transitively.
 */
function collectNeededUnits(
	units: TopLevelUnit[],
	referencesOf: (unit: TopLevelUnit) => Iterable<string>,
): Set<TopLevelUnit> {
	const unitByName = new Map<string, TopLevelUnit>();
	for (const unit of units) for (const name of unit.names) unitByName.set(name, unit);

	const needed = new Set<TopLevelUnit>();
	const queue: TopLevelUnit[] = [];
	const need = (unit: TopLevelUnit | undefined) => {
		if (unit && !needed.has(unit)) {
			needed.add(unit);
			queue.push(unit);
		}
	};
	for (const unit of units) {
		if (unit.isRoot) need(unit);
		for (const name of unit.rootReferences) need(unitByName.get(name));
	}
	while (queue.length > 0) {
		for (const name of referencesOf(queue.pop()!)) need(unitByName.get(name));
	}
	return needed;
}

/**
 * Collects the declarations to remove: those only removed code needed, and every declaration the
 * browser module does not need that uses a stripped binding or a removed declaration.
 */
function collectRemovedUnits(units: TopLevelUnit[], input: StrippedImportCleanupInput): Set<TopLevelUnit> {
	const neededBefore = collectNeededUnits(units, (unit) => unit.allReferences);
	const neededAfter = collectNeededUnits(units, (unit) => unit.keptReferences.keys());
	const candidates = units.filter(
		(unit) => (unit.kind === 'declaration' || unit.kind === 'exported-declaration') && !neededAfter.has(unit),
	);
	const removed = new Set(candidates.filter((unit) => unit.kind === 'declaration' && neededBefore.has(unit)));
	const removedNames = new Set([...removed].flatMap((unit) => [...unit.names]));

	let changed = true;
	while (changed) {
		changed = false;
		for (const unit of candidates) {
			if (removed.has(unit)) continue;
			const references = [...unit.keptReferences.keys()];
			if (references.some((name) => input.strippedBindings.has(name) || removedNames.has(name))) {
				removed.add(unit);
				for (const name of unit.names) removedNames.add(name);
				changed = true;
			}
		}
	}
	return removed;
}

/**
 * Removes a declaration, or replaces it with `undefined` bindings when the module still exports its names.
 */
function createRemovalEdit(unit: TopLevelUnit, exportedLocals: ReadonlySet<string>): SourceEdit {
	const statement = unit.statement;
	const keepsNames = unit.kind === 'exported-declaration' || [...unit.names].some((name) => exportedLocals.has(name));
	if (!keepsNames) return { start: statement.start, end: statement.end, replacement: '' };

	const target = unit.kind === 'exported-declaration' ? statement.declaration : statement;
	const bindings = [...unit.names].map((name) => `${name} = undefined`).join(', ');
	return { start: target.start, end: target.end, replacement: `const ${bindings};` };
}

function getValueImportNames(statement: any): string[] {
	if (statement.importKind === 'type') return [];
	return (statement.specifiers ?? [])
		.filter((specifier: any) => specifier.importKind !== 'type')
		.map((specifier: any) => specifier.local.name as string);
}

function toLineColumn(source: string, offset: number): string {
	const lines = source.slice(0, offset).split('\n');
	return `${lines.length}:${lines.at(-1)!.length + 1}`;
}

function assertNoStrippedBindingReferences(
	browserUnits: Iterable<TopLevelUnit>,
	input: StrippedImportCleanupInput,
): void {
	let first: { name: string; node: any } | undefined;
	for (const unit of browserUnits) {
		for (const [name, node] of unit.keptReferences) {
			if (input.strippedBindings.has(name) && (!first || node.start < first.node.start)) first = { name, node };
		}
	}
	if (!first) return;

	const specifier = input.strippedBindings.get(first.name);
	throw new Error(
		`[Ecopages Client Graph] '${first.name}' (imported from '${specifier}') is used at ${input.filename}:${toLineColumn(input.source, first.node.start)}, but that import is server-only and the browser build removes it. Use it only in server-only Page options such as middleware or props, or in code the browser module does not reach.`,
	);
}

/**
 * Plans the removal of the top-level code the browser module does not need once server-only code is gone.
 *
 * @remarks
 * The browser module needs its top-level statements other than declarations (the default export
 * included), the declarations that create a client root, and the named exports browser importers
 * are known to request. A named export nothing requests is not needed: rolldown would tree-shake
 * it, and the requests are unknown for imports through a path alias. Declarations those roots reach are needed too.
 *
 * A declaration that is not needed is removed when only removed code used it, or when it uses a
 * stripped binding or another removed declaration; the check repeats until nothing else changes.
 * Removal ignores side effects of the declaration's initializer, so code that must run in the
 * browser belongs in a statement of its own. An exported name keeps its binding, set to
 * `undefined`. An import only removed code used is removed too, so its module stays out of the
 * browser graph. A needed statement, or an `export { ... }`, that still uses a stripped binding
 * throws, naming the binding, its import specifier and the `line:column` of the use.
 */
export function planStrippedImportCleanup(input: StrippedImportCleanupInput): SourceEdit[] {
	const imports: any[] = [];
	const units: TopLevelUnit[] = [];
	for (const statement of input.program.body) {
		if (statement.type === 'ImportDeclaration') {
			imports.push(statement);
		} else {
			units.push(createUnit(statement, input));
		}
	}

	const removed = collectRemovedUnits(units, input);
	const surviving = units.filter((unit) => !removed.has(unit));
	const exportSpecifiers = surviving.filter((unit) => unit.kind === 'export-specifiers');
	const browserUnits = collectNeededUnits(surviving, (unit) => unit.keptReferences.keys());
	assertNoStrippedBindingReferences([...browserUnits, ...exportSpecifiers], input);

	const exportedLocals = new Set(exportSpecifiers.flatMap((unit) => [...unit.allReferences]));
	const edits = [...removed].map((unit) => createRemovalEdit(unit, exportedLocals));

	const usedBefore = new Set(units.flatMap((unit) => [...unit.allReferences]));
	const usedAfter = new Set(surviving.flatMap((unit) => [...unit.keptReferences.keys()]));
	for (const statement of imports) {
		if (input.editedImports.has(statement)) continue;
		const names = getValueImportNames(statement);
		if (names.some((name) => usedBefore.has(name)) && !names.some((name) => usedAfter.has(name))) {
			edits.push({ start: statement.start, end: statement.end, replacement: '' });
		}
	}

	return edits;
}
