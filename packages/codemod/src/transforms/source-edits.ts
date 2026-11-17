/**
 * Source-splicing helpers shared by the Radiant transforms.
 *
 * @remarks
 * These transforms do not reprint through Recast. A change to a class or JSX node makes Recast reprint the
 * whole node, which re-indents it and drops whitespace in JSX text. They record each change as a replacement
 * between two offsets of the original source and apply them to the text, so every other character stays as
 * written: tabs or spaces, line endings and JSX text.
 */

import type { Collection, JSCodeshift } from 'jscodeshift';

export const RADIANT_SOURCE = /^@ecopages\/radiant(\/|$)/;

export type Position = { line: number; column: number };

export type NodeLike = { type: string; loc?: { start: Position; end: Position } | null } & Record<string, unknown>;

/** A replacement of the source text between two offsets. */
export type Edit = { start: number; end: number; text: string };

/** Offsets of a node's bounds in the original source text. */
export type Offsets = { start: (node: NodeLike) => number; end: (node: NodeLike) => number };

/**
 * Recast parse options under which a node's line and column match the original text.
 *
 * @remarks
 * A new object on every call: jscodeshift writes its parser into the options object it is given, and a shared
 * one then carries that parser into the next file.
 */
export function parseOptions(): { tabWidth: number } {
	return { tabWidth: 1 };
}

export function isNode(value: unknown): value is NodeLike {
	return typeof value === 'object' && value !== null && typeof (value as NodeLike).type === 'string';
}

export function lineOf(node: unknown): number | undefined {
	return isNode(node) ? node.loc?.start.line : undefined;
}

export function keyName(node: NodeLike): string | undefined {
	const key = node.key;
	if (node.computed || !isNode(key)) return undefined;
	if (key.type === 'Identifier') return key.name as string;
	if (key.type === 'StringLiteral') return key.value as string;
	return undefined;
}

export function stringValue(node: unknown): string | undefined {
	return isNode(node) && node.type === 'StringLiteral' ? (node.value as string) : undefined;
}

/**
 * Reads node offsets from their line and column.
 *
 * @remarks
 * Recast parses a copy of the source with its line endings normalized and its indentation re-measured, so the
 * parser's own `start` and `end` drift from the original text on CRLF or tab-indented files. Line and column
 * stay true when the source is parsed with {@link parseOptions}.
 */
export function offsetsOf(source: string): Offsets {
	const lineStarts = [0];
	for (let index = source.indexOf('\n'); index !== -1; index = source.indexOf('\n', index + 1)) {
		lineStarts.push(index + 1);
	}
	const at = (position: Position) => lineStarts[position.line - 1] + position.column;
	return {
		start: (node) => at((node.loc as { start: Position }).start),
		end: (node) => at((node.loc as { end: Position }).end),
	};
}

export function applyEdits(source: string, edits: Edit[]): string {
	let result = source;
	for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
		result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
	}
	return result;
}

/** Removes a node with its leading comments, and its line when nothing else is on it. */
export function removeNode(source: string, pos: Offsets, node: NodeLike): Edit {
	const comments = ((node.leadingComments ?? []) as NodeLike[]).filter(
		(comment) => pos.start(comment) < pos.start(node),
	);
	let start = pos.start(comments.length > 0 ? comments[0] : node);
	let end = pos.end(node);
	const lineStart = source.lastIndexOf('\n', start - 1) + 1;
	const lineEnd = source.indexOf('\n', end);
	const restOfLine = source.slice(end, lineEnd === -1 ? undefined : lineEnd);
	if (source.slice(lineStart, start).trim() === '' && restOfLine.trim() === '') {
		start = lineStart;
		end = lineEnd === -1 ? source.length : lineEnd + 1;
	}
	return { start, end, text: '' };
}

/** Maps each local name imported from `@ecopages/radiant` or one of its subpaths to its exported name. */
export function readRadiantImports(j: JSCodeshift, root: Collection): Map<string, string> {
	const imports = new Map<string, string>();
	root.find(j.ImportDeclaration)
		.filter((path) => RADIANT_SOURCE.test(String(path.node.source.value)))
		.forEach((path) => {
			for (const specifier of path.node.specifiers ?? []) {
				if (specifier.type !== 'ImportSpecifier') continue;
				imports.set(String(specifier.local?.name ?? specifier.imported.name), String(specifier.imported.name));
			}
		});
	return imports;
}
