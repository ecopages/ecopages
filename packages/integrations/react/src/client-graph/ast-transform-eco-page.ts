/**
 * Finds the server-only `eco.page(...)` options of browser-bound modules, and the `props` factories of the layout
 * entries written inline in its `layout` option.
 *
 * @remarks
 * Nodes are typed `any`, as in `walkAstNodes`: they come from the parser as untyped ESTree objects, and each helper
 * checks `type` before reading a field.
 */

import { walkAstNodes } from './ast-walk.ts';
import type { SourceEdit } from './ast-transform-import-edits.ts';

const SERVER_ONLY_ECO_PAGE_OPTION_KEYS = new Set(['cache', 'middleware', 'dependencies', 'metadata', 'props', 'paths']);

type SourceRange = { start: number; end: number };

export type ServerOnlyPageCode = {
	/** Edits that remove the server-only code. */
	edits: SourceEdit[];
	/** Nodes whose subtrees the edits remove; references inside them do not reach the browser. */
	strippedNodes: Set<unknown>;
};

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

function getObjectPropertyKeyName(node: any): string | undefined {
	if (!node) return undefined;
	if (node.type === 'Identifier') return node.name;
	if (node.type === 'StringLiteral' || node.type === 'Literal') {
		return typeof node.value === 'string' ? node.value : undefined;
	}
	return undefined;
}

function isServerOnlyOption(property: any): boolean {
	if (property?.type !== 'Property' || property.computed) return false;
	const keyName = getObjectPropertyKeyName(property.key);
	return keyName !== undefined && SERVER_ONLY_ECO_PAGE_OPTION_KEYS.has(keyName);
}

export function isPropertyNamed(property: any, name: string): boolean {
	return property?.type === 'Property' && !property.computed && getObjectPropertyKeyName(property.key) === name;
}

const TRANSPARENT_EXPRESSION_TYPES = new Set([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSTypeAssertion',
]);

/** Returns the expression inside parentheses and type-only wrappers such as `as const` and `satisfies`. */
function unwrapExpression(node: any): any {
	let current = node;
	while (current && TRANSPARENT_EXPRESSION_TYPES.has(current.type)) current = current.expression;
	return current;
}

/**
 * Returns the tiers of a `layout` option, each unwrapped from type-only wrappers: the value itself, or the elements
 * of an array. A hole stays `null`.
 */
export function getLayoutTiers(layout: any): any[] {
	const value = unwrapExpression(layout);
	const tiers = value?.type === 'ArrayExpression' ? value.elements : [value];
	return tiers.map(unwrapExpression);
}

/** Returns the layout entries written as object literals in a `layout` option. */
export function getInlineLayoutEntries(layout: any): any[] {
	return getLayoutTiers(layout).filter((tier: any) => tier?.type === 'ObjectExpression');
}

/**
 * Returns the range that removes one property and its separating comma.
 *
 * @remarks
 * A property followed by another one is removed up to the next property's start. The last
 * property is removed from the end of the one before it (or from its own start) up to the
 * closing brace, so a trailing comma goes with it.
 */
function getPropertyRemovalRange(objectExpression: any, index: number): SourceRange {
	const properties = objectExpression.properties;
	const property = properties[index];
	const next = properties[index + 1];
	if (next) return { start: property.start, end: next.start };
	const previous = properties[index - 1];
	return { start: previous ? previous.end : property.start, end: objectExpression.end - 1 };
}

function mergeRanges(ranges: SourceRange[]): SourceRange[] {
	const merged: SourceRange[] = [];
	for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
		const last = merged.at(-1);
		if (last && range.start <= last.end) {
			last.end = Math.max(last.end, range.end);
		} else {
			merged.push({ ...range });
		}
	}
	return merged;
}

function collectPropertyEdits(
	objectExpression: any,
	isStripped: (property: any) => boolean,
	code: ServerOnlyPageCode,
): void {
	const ranges: SourceRange[] = [];
	objectExpression.properties.forEach((property: any, index: number) => {
		if (!isStripped(property)) return;
		code.strippedNodes.add(property);
		ranges.push(getPropertyRemovalRange(objectExpression, index));
	});
	for (const range of mergeRanges(ranges)) code.edits.push({ ...range, replacement: '' });
}

/**
 * Removes the `props` factory of each layout entry written inline in the `layout` option.
 *
 * @remarks
 * The factory runs only on the server: the browser renders each tier from the props the server resolved and
 * shipped as `tiers`. An entry imported from another module cannot be edited here; its module reaches the
 * browser whole, so a server import its factory uses fails the browser build.
 */
function collectLayoutEntryEdits(objectExpression: any, code: ServerOnlyPageCode): void {
	const layout = objectExpression.properties.find((property: any) => isPropertyNamed(property, 'layout'));
	if (!layout) return;
	for (const entry of getInlineLayoutEntries(layout.value)) {
		collectPropertyEdits(entry, (property) => isPropertyNamed(property, 'props'), code);
	}
}

function collectPageOptionEdits(node: any, code: ServerOnlyPageCode): void {
	const objectExpression = node.arguments[0];
	collectPropertyEdits(objectExpression, isServerOnlyOption, code);
	collectLayoutEntryEdits(objectExpression, code);
}

/**
 * Collects the server-only `eco.page(...)` options of a browser-bound module and the edits that remove them.
 */
export function collectServerOnlyPageCode(program: any): ServerOnlyPageCode {
	const code: ServerOnlyPageCode = { edits: [], strippedNodes: new Set() };

	walkAstNodes(program, (node) => {
		if (!isEcoPageOptionsCall(node)) return;
		collectPageOptionEdits(node, code);
	});

	return code;
}
