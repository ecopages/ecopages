/**
 * Removes the top-level code only server-only Page code used, and rejects a module that would
 * still reference a binding whose import the boundary strips.
 */

import type { SourceEdit } from './ast-transform-import-edits.ts';
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
};

type TopLevelUnit = {
	statement: any;
	/** Names the statement declares at the top level. */
	names: Set<string>;
	/** A non-exported declaration, which can go when only removed code used it. */
	removable: boolean;
	/** First runtime reference to each free name, outside the stripped subtrees. */
	keptReferences: Map<string, any>;
	/** Every free name the statement references, including inside the stripped subtrees. */
	allReferences: Set<string>;
};

function isRemovableDeclaration(statement: any): boolean {
	if (statement.declare) return false;
	return (
		statement.type === 'VariableDeclaration' ||
		statement.type === 'FunctionDeclaration' ||
		statement.type === 'ClassDeclaration'
	);
}

function createUnit(statement: any, strippedNodes: ReadonlySet<unknown>): TopLevelUnit {
	const names = new Set<string>();
	collectLexicalDeclarations(statement, names);
	const keptReferences = new Map<string, any>();
	const allReferences = new Set<string>();

	walkScopedReferences(statement, {
		onReference: (name) => allReferences.add(name),
	});
	walkScopedReferences(statement, {
		onReference: (name, node) => {
			if (!keptReferences.has(name)) keptReferences.set(name, node);
		},
		onNode: (node) => strippedNodes.has(node),
	});

	return { statement, names, removable: isRemovableDeclaration(statement), keptReferences, allReferences };
}

/**
 * Marks the units the module needs, starting from every statement that is not a removable declaration.
 *
 * @returns The names the needed units reference.
 */
function collectUsedNames(units: TopLevelUnit[], referencesOf: (unit: TopLevelUnit) => Iterable<string>) {
	const unitByName = new Map<string, TopLevelUnit>();
	for (const unit of units) for (const name of unit.names) unitByName.set(name, unit);

	const needed = new Set(units.filter((unit) => !unit.removable));
	const queue = [...needed];
	const usedNames = new Set<string>();
	while (queue.length > 0) {
		for (const name of referencesOf(queue.pop()!)) {
			usedNames.add(name);
			const unit = unitByName.get(name);
			if (unit && !needed.has(unit)) {
				needed.add(unit);
				queue.push(unit);
			}
		}
	}
	return { needed, usedNames };
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

function assertNoStrippedBindingReferences(kept: TopLevelUnit[], input: StrippedImportCleanupInput): void {
	let first: { name: string; node: any } | undefined;
	for (const unit of kept) {
		for (const [name, node] of unit.keptReferences) {
			if (input.strippedBindings.has(name) && (!first || node.start < first.node.start)) first = { name, node };
		}
	}
	if (!first) return;

	const specifier = input.strippedBindings.get(first.name);
	throw new Error(
		`[Ecopages Client Graph] '${first.name}' (imported from '${specifier}') is used at ${input.filename}:${toLineColumn(input.source, first.node.start)}, but that import is server-only and the browser build removes it. Use it only in server-only Page options such as middleware or staticProps, or in top-level code only they use.`,
	);
}

/**
 * Plans the removal of top-level declarations and imports that only stripped code used.
 *
 * @remarks
 * A non-exported declaration that some code referenced before stripping, and that no kept code
 * references after it, is removed; removal repeats until nothing else becomes unused. An import
 * whose bindings only removed code used goes too, so its module never enters the browser graph.
 * Declarations nothing referenced in the first place stay. Afterwards, any kept reference to a
 * stripped binding throws, naming the binding, its import specifier and the `line:column` of the use.
 */
export function planStrippedImportCleanup(input: StrippedImportCleanupInput): SourceEdit[] {
	const imports: any[] = [];
	const units: TopLevelUnit[] = [];
	for (const statement of input.program.body) {
		if (statement.type === 'ImportDeclaration') {
			imports.push(statement);
		} else {
			units.push(createUnit(statement, input.strippedNodes));
		}
	}

	const before = collectUsedNames(units, (unit) => unit.allReferences);
	const after = collectUsedNames(units, (unit) => unit.keptReferences.keys());
	const edits: SourceEdit[] = [];

	const kept: TopLevelUnit[] = [];
	for (const unit of units) {
		if (unit.removable && before.needed.has(unit) && !after.needed.has(unit)) {
			edits.push({ start: unit.statement.start, end: unit.statement.end, replacement: '' });
		} else {
			kept.push(unit);
		}
	}

	for (const statement of imports) {
		if (input.editedImports.has(statement)) continue;
		const names = getValueImportNames(statement);
		if (names.some((name) => before.usedNames.has(name)) && !names.some((name) => after.usedNames.has(name))) {
			edits.push({ start: statement.start, end: statement.end, replacement: '' });
		}
	}

	assertNoStrippedBindingReferences(kept, input);
	return edits;
}
