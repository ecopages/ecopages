import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';

/** Repository root, the base for every `file="..."` path in a docs fence. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

interface SnippetSpec {
	file: string;
	region?: string;
}

interface CodeNode {
	type: string;
	meta?: string | null;
	value?: string;
	children?: CodeNode[];
}

const FENCE = /^(`{3,})(.*)\n([\s\S]*?)^\1[ \t]*$/gm;

/** Reads `file="..."` and `region="..."` from a fence info string, or returns `undefined` when there is no `file`. */
export function parseSnippetMeta(meta: string | null | undefined): SnippetSpec | undefined {
	const file = meta?.match(/\bfile="([^"]+)"/)?.[1];
	if (!file) {
		return undefined;
	}
	return { file, region: meta?.match(/\bregion="([^"]+)"/)?.[1] };
}

/**
 * Returns the lines between `#region <name>` and `#endregion <name>` markers, or the whole file
 * without its marker lines when no region is asked for.
 */
function selectRegion(source: string, spec: SnippetSpec): string {
	const lines = source.split('\n');
	const isMarker = (line: string) => /#(end)?region\b/.test(line);
	if (!spec.region) {
		return lines.filter((line) => !isMarker(line)).join('\n');
	}

	const start = lines.findIndex((line) => new RegExp(`#region ${spec.region}\\b`).test(line));
	const end = lines.findIndex((line) => new RegExp(`#endregion ${spec.region}\\b`).test(line));
	if (start === -1 || end <= start) {
		throw new Error(`Snippet region "${spec.region}" is missing or unclosed in ${spec.file}`);
	}
	return lines
		.slice(start + 1, end)
		.filter((line) => !isMarker(line))
		.join('\n');
}

/** Reads the snippet a fence points at, trimmed of surrounding blank lines. */
export function readSnippet(spec: SnippetSpec, root = REPO_ROOT): string {
	return selectRegion(fileSystem.readFileSync(path.resolve(root, spec.file)), spec).replace(/^\n+|\n+$/g, '');
}

/**
 * Fills fenced code blocks that carry `file="..."` (and optionally `region="..."`) from the file they name.
 *
 * @remarks
 * The fence body in the page stays empty, so the code on the page is always the code CI builds. Paths are
 * relative to the repository root.
 */
export function remarkSnippetInclude(options: { root?: string } = {}) {
	return (tree: CodeNode) => {
		const visit = (node: CodeNode) => {
			if (node.type === 'code') {
				const spec = parseSnippetMeta(node.meta);
				if (spec) {
					node.value = readSnippet(spec, options.root);
				}
			}
			node.children?.forEach(visit);
		};
		visit(tree);
	};
}

/**
 * Fills the same fences in raw Markdown, for exports that do not go through MDX such as `docs-llm`.
 */
export function expandSnippetFences(markdown: string, root = REPO_ROOT): string {
	return markdown.replace(FENCE, (fence, ticks: string, info: string) => {
		const spec = parseSnippetMeta(info);
		return spec ? `${ticks}${info}\n${readSnippet(spec, root)}\n${ticks}` : fence;
	});
}
