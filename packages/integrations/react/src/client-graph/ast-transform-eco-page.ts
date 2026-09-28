/**
 * Strips server-only `eco.page(...)` option keys from browser-bound modules.
 */

import { walkAstNodes } from './ast-walk.ts';
import { applySourceEdits, type SourceEdit } from './ast-transform-import-edits.ts';

const SERVER_ONLY_ECO_PAGE_OPTION_KEYS = new Set([
	'cache',
	'middleware',
	'dependencies',
	'requires',
	'metadata',
	'staticProps',
	'staticPaths',
]);

function isEcoPageOptionsCall(node: any): boolean {
	return (
		node.type === 'CallExpression' &&
		node.callee?.type === 'MemberExpression' &&
		node.callee.object?.type === 'Identifier' &&
		node.callee.object.name === 'eco' &&
		node.callee.property?.type === 'Identifier' &&
		node.callee.property.name === 'page' &&
		node.arguments?.[0]?.type === 'ObjectExpression'
	);
}

function collectEcoPageOptionStripEdit(node: any, source: string, edits: SourceEdit[]): void {
	if (!isEcoPageOptionsCall(node)) return;

	const objectExpression = node.arguments[0];
	const keptProperties: string[] = [];
	let removedProperty = false;

	for (const property of objectExpression.properties ?? []) {
		if (property?.type === 'Property') {
			const keyName = getObjectPropertyKeyName(property.key);
			if (keyName && SERVER_ONLY_ECO_PAGE_OPTION_KEYS.has(keyName)) {
				removedProperty = true;
				continue;
			}
		}

		keptProperties.push(source.slice(property.start, property.end));
	}

	if (!removedProperty) return;

	const replacement = keptProperties.length > 0 ? `{ ${keptProperties.join(', ')} }` : '{}';
	edits.push({
		start: objectExpression.start,
		end: objectExpression.end,
		replacement,
	});
}

function getObjectPropertyKeyName(node: any): string | undefined {
	if (!node) return undefined;
	if (node.type === 'Identifier') return node.name;
	if (node.type === 'StringLiteral' || node.type === 'Literal') {
		return typeof node.value === 'string' ? node.value : undefined;
	}
	return undefined;
}

/**
 * Removes server-only `eco.page(...)` options from browser-bound modules.
 */
export function stripServerOnlyEcoPageOptions(
	source: string,
	program: any,
): { transformed: string; modified: boolean } {
	const edits: SourceEdit[] = [];

	walkAstNodes(program, (node) => {
		collectEcoPageOptionStripEdit(node, source, edits);
	});

	if (edits.length === 0) {
		return { transformed: source, modified: false };
	}

	return { transformed: applySourceEdits(source, edits), modified: true };
}
