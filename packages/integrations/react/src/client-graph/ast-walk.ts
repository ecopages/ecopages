/**
 * Generic depth-first walk over Oxc AST object graphs.
 */

/**
 * Visits every object node in an Oxc AST tree.
 *
 * @param node - Root AST node or subtree.
 * @param onNode - Called for each object node; return `true` to skip descending into its children.
 */
export function walkAstNodes(node: unknown, onNode: (node: any) => boolean | void): void {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walkAstNodes(child, onNode);
		return;
	}

	const skipChildren = onNode(node) === true;
	if (skipChildren) return;

	for (const key in node) {
		if (key !== 'type' && key !== 'start' && key !== 'end') {
			walkAstNodes((node as Record<string, unknown>)[key], onNode);
		}
	}
}
