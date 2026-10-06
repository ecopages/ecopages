import { realpathSync } from 'node:fs';
import path from 'node:path';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import type { EcoSourceTransform } from '../plugins/source-transform.ts';

type AstNode = {
	type?: string;
	start?: number;
	end?: number;
	name?: string;
	[key: string]: unknown;
};

type SourceEdit = {
	start: number;
	end: number;
	replacement: string;
};

/**
 * Resolves `dir` through symlinks, including for a directory that does not
 * exist yet.
 *
 * @remarks
 * Node resolves a relative import and `import.meta.url` against the real path
 * of the module, so a path computed from a symlinked output directory (macOS
 * `/tmp`, a linked project root) would point at the wrong place.
 */
export function realpathOfDirectory(dir: string): string {
	try {
		return realpathSync(dir);
	} catch {
		const parent = path.dirname(dir);
		return parent === dir ? dir : path.join(realpathOfDirectory(parent), path.basename(dir));
	}
}

function isAstNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null;
}

function walkAst(value: unknown, visit: (node: AstNode) => void): void {
	if (Array.isArray(value)) {
		for (const child of value) walkAst(child, visit);
		return;
	}
	if (!isAstNode(value)) return;

	visit(value);
	for (const child of Object.values(value)) walkAst(child, visit);
}

function isImportMeta(node: unknown): boolean {
	if (!isAstNode(node) || node.type !== 'MetaProperty') return false;
	return (
		isAstNode(node.meta) &&
		node.meta.type === 'Identifier' &&
		node.meta.name === 'import' &&
		isAstNode(node.property) &&
		node.property.type === 'Identifier' &&
		node.property.name === 'meta'
	);
}

const DIRECTORY_PROPERTIES = new Set(['dirname', 'dir']);
const FILE_PROPERTIES = new Set(['filename', 'path']);

function collectImportMetaEdits(
	code: string,
	id: string,
	runtimeDir: string,
): {
	edits: SourceEdit[];
	needsNodePath: boolean;
	pathBinding: string;
} {
	const program = parseModuleSource(id, code, { sourceType: 'module' }).program as unknown as AstNode;
	const relativeDir = path.relative(runtimeDir, path.dirname(id)).replaceAll('\\', '/');
	const relativeFile = relativeDir ? `${relativeDir}/${path.basename(id)}` : `./${path.basename(id)}`;
	const edits: SourceEdit[] = [];
	let needsNodePath = false;
	const identifiers = new Set<string>();
	walkAst(program, (node) => {
		if (node.type === 'Identifier' && typeof node.name === 'string') identifiers.add(node.name);
	});
	let pathBinding = '__ecoServerPath';
	while (identifiers.has(pathBinding)) pathBinding = `_${pathBinding}`;

	walkAst(program, (node) => {
		if (node.type !== 'MemberExpression' && node.type !== 'StaticMemberExpression') return;
		if (!isImportMeta(node.object) || !isAstNode(node.property) || node.property.type !== 'Identifier') return;
		if (typeof node.start !== 'number' || typeof node.end !== 'number') return;
		const property = node.property.name ?? '';

		if (DIRECTORY_PROPERTIES.has(property) || FILE_PROPERTIES.has(property)) {
			needsNodePath = true;
			const target = DIRECTORY_PROPERTIES.has(property) ? relativeDir || '.' : relativeFile;
			edits.push({
				start: node.start,
				end: node.end,
				replacement: `${pathBinding}.resolve(import.meta.dirname, ${JSON.stringify(target)})`,
			});
			return;
		}

		if (property === 'file') {
			edits.push({ start: node.start, end: node.end, replacement: JSON.stringify(path.basename(id)) });
			return;
		}

		if (property === 'url') {
			edits.push({
				start: node.start,
				end: node.end,
				replacement: `new URL(${JSON.stringify(relativeFile)}, import.meta.url).href`,
			});
		}
	});

	return { edits, needsNodePath, pathBinding };
}

function applySourceEdits(code: string, edits: SourceEdit[]): string {
	let transformed = code;
	for (const edit of edits.sort((left, right) => right.start - left.start)) {
		transformed = `${transformed.slice(0, edit.start)}${edit.replacement}${transformed.slice(edit.end)}`;
	}
	return transformed;
}

/**
 * Creates a source transform that keeps `import.meta.url`, `import.meta.dirname`
 * and `import.meta.filename` (and Bun's `dir`, `path` and `file`) of every bundled
 * module pointing at its source file, for server output that runs from
 * `runtimeDir`.
 *
 * @remarks
 * A bundled module would otherwise see the location of its output chunk, so a
 * lookup such as Core reading `../../../package.json` or a page globbing
 * `import.meta.dirname` would search `dist/.server/` or `.eco/.server-modules/`.
 * The rewrite is a path relative to the output chunk's own `import.meta`, so
 * the output keeps working after it moves together with the sources. It
 * assumes flat output file names in `runtimeDir`, which the external package
 * plugin already requires. `import.meta.resolve()` is not rewritten and
 * resolves from the output chunk.
 *
 * The filter matches the extensions the shared source-transform pass accepts
 * (`.ts`, `.tsx`, `.js`, `.jsx`), so bundled `.mjs`, `.cjs`, `.mts` and
 * `.cts` modules keep the `import.meta` of their output chunk.
 */
export function createPreserveImportMetaTransform(runtimeDir: string): EcoSourceTransform {
	let realRuntimeDir: string | undefined;
	return {
		name: 'preserve-import-meta-for-server-output',
		filter: /\.[jt]sx?$/,
		transform(code, id) {
			if (!code.includes('import.meta')) {
				return undefined;
			}

			realRuntimeDir ??= realpathOfDirectory(runtimeDir);
			const { edits, needsNodePath, pathBinding } = collectImportMetaEdits(code, id, realRuntimeDir);
			if (edits.length === 0) return undefined;

			const transformed = applySourceEdits(code, edits);
			return {
				code: needsNodePath ? `import * as ${pathBinding} from 'node:path';\n${transformed}` : transformed,
			};
		},
	};
}
