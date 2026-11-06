/**
 * Finds server-only Page code in browser-bound modules: server-only `eco.page(...)` options
 * and the legacy Page exports core reads on the server.
 */

import { walkAstNodes } from './ast-walk.ts';
import type { SourceEdit } from './ast-transform-import-edits.ts';

const SERVER_ONLY_ECO_PAGE_OPTION_KEYS = new Set([
	'cache',
	'middleware',
	'dependencies',
	'requires',
	'metadata',
	'staticProps',
	'staticPaths',
]);

/** Page module exports core reads on the server when the Page does not set the matching option. */
const SERVER_ONLY_PAGE_EXPORT_NAMES = new Set(['getMetadata', 'getStaticProps', 'getStaticPaths']);

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

function collectPageOptionEdits(node: any, code: ServerOnlyPageCode): void {
	const objectExpression = node.arguments[0];
	const ranges: SourceRange[] = [];
	objectExpression.properties.forEach((property: any, index: number) => {
		if (!isServerOnlyOption(property)) return;
		code.strippedNodes.add(property);
		ranges.push(getPropertyRemovalRange(objectExpression, index));
	});
	for (const range of mergeRanges(ranges)) code.edits.push({ ...range, replacement: '' });
}

/**
 * Replaces the value of a legacy server-only Page export with `undefined`, keeping the export name.
 */
function collectLegacyExportEdits(statement: any, code: ServerOnlyPageCode): void {
	const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : undefined;
	if (declaration?.type === 'FunctionDeclaration' && SERVER_ONLY_PAGE_EXPORT_NAMES.has(declaration.id?.name)) {
		code.strippedNodes.add(declaration);
		code.edits.push({
			start: declaration.start,
			end: declaration.end,
			replacement: `const ${declaration.id.name} = undefined;`,
		});
		return;
	}
	if (declaration?.type !== 'VariableDeclaration') return;
	for (const declarator of declaration.declarations) {
		if (declarator.id?.type !== 'Identifier' || !declarator.init) continue;
		if (!SERVER_ONLY_PAGE_EXPORT_NAMES.has(declarator.id.name)) continue;
		code.strippedNodes.add(declarator.init);
		code.edits.push({ start: declarator.init.start, end: declarator.init.end, replacement: 'undefined' });
	}
}

/**
 * Collects the server-only Page code of a browser-bound module and the edits that remove it.
 *
 * @remarks
 * Legacy exports (`getMetadata`, `getStaticProps`, `getStaticPaths`) count as server-only only
 * in a module that calls `eco.page(...)`, so a helper with one of those names elsewhere is kept.
 */
export function collectServerOnlyPageCode(program: any): ServerOnlyPageCode {
	const code: ServerOnlyPageCode = { edits: [], strippedNodes: new Set() };
	let definesPage = false;

	walkAstNodes(program, (node) => {
		if (!isEcoPageOptionsCall(node)) return;
		definesPage = true;
		collectPageOptionEdits(node, code);
	});

	if (definesPage) {
		for (const statement of program.body) collectLegacyExportEdits(statement, code);
	}

	return code;
}
