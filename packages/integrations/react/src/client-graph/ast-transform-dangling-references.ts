/**
 * Detects references to bindings whose server-only import the boundary removed.
 */

import { walkAstNodes } from './ast-walk.ts';

function isDeclaringNode(node: any): boolean {
	return (
		node.type === 'VariableDeclarator' || node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration'
	);
}

function isFunctionNode(node: any): boolean {
	return (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	);
}

function collectDeclaredNames(node: any, declared: Set<string>): void {
	if (isDeclaringNode(node) && node.id?.type === 'Identifier') declared.add(node.id.name);
	if (!isFunctionNode(node)) return;
	for (const param of node.params ?? []) {
		if (param?.type === 'Identifier') declared.add(param.name);
	}
}

/** Returns the one child that can still reference a binding when the other children are only names. */
function getReferencingChild(node: any): unknown {
	if (node.type === 'MemberExpression' && !node.computed) return node.object;
	if (node.type === 'Property' && !node.computed && !node.shorthand) return node.value;
	return undefined;
}

/**
 * Collects the first reference position of each removed binding and every name the module declares itself.
 */
function collectBindingUsage(program: unknown, removed: ReadonlySet<string>) {
	const declared = new Set<string>();
	const referenced = new Map<string, number>();

	const visit = (root: unknown): void =>
		walkAstNodes(root, (node) => {
			if (typeof node.type === 'string' && node.type.startsWith('TS')) return true;
			collectDeclaredNames(node, declared);
			const child = getReferencingChild(node);
			if (child !== undefined) {
				visit(child);
				return true;
			}
			if (node.type === 'Identifier' && removed.has(node.name) && !referenced.has(node.name)) {
				referenced.set(node.name, node.start);
			}
			return false;
		});
	visit(program);

	return { declared, referenced };
}

/**
 * Throws when a binding whose server-only import was removed is still referenced.
 *
 * @remarks
 * Emitting such a module would throw a `ReferenceError` in the browser. Names the module also
 * declares itself are skipped, and type positions never reference a runtime binding.
 */
export function assertNoDanglingBindingReferences(
	filename: string,
	program: unknown,
	removedBindings: readonly string[],
): void {
	if (removedBindings.length === 0) return;

	const { declared, referenced } = collectBindingUsage(program, new Set(removedBindings));
	for (const [name, position] of referenced) {
		if (!declared.has(name)) {
			throw new Error(
				`[Ecopages Client Graph] '${name}' is referenced at ${filename}:${position} but its server-only import was removed from the browser build. Use it only inside server-only Page options.`,
			);
		}
	}
}
