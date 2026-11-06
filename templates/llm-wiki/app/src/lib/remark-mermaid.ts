import { PeleError, render } from 'pele';

interface MermaidNode {
	type: string;
	lang?: string | null;
	value?: string;
	children?: MermaidNode[];
	position?: { start: { line: number; column: number } };
	[key: string]: unknown;
}

interface MermaidFile {
	path?: string;
}

const UNSAFE_HTML_IDENTIFIER = 'wikiUnsafeHtml';

const unsafeHtmlImport: MermaidNode = {
	type: 'mdxjsEsm',
	value: `import { unsafeHtml as ${UNSAFE_HTML_IDENTIFIER} } from '@ecopages/jsx';`,
	data: {
		estree: {
			type: 'Program',
			sourceType: 'module',
			body: [
				{
					type: 'ImportDeclaration',
					specifiers: [
						{
							type: 'ImportSpecifier',
							imported: { type: 'Identifier', name: 'unsafeHtml' },
							local: { type: 'Identifier', name: UNSAFE_HTML_IDENTIFIER },
						},
					],
					source: { type: 'Literal', value: '@ecopages/jsx', raw: "'@ecopages/jsx'" },
				},
			],
		},
	},
};

/**
 * Builds a flow element whose only child is the SVG marked as trusted markup.
 *
 * @remarks
 * MDX drops raw `html` nodes and the JSX runtime escapes string children, so the SVG
 * goes through `unsafeHtml`, imported once per page by {@link unsafeHtmlImport}. The
 * SVG comes from Pele, never from page text, so it is trusted.
 */
function diagramElement(svg: string): MermaidNode {
	return {
		type: 'mdxJsxFlowElement',
		name: 'div',
		attributes: [{ type: 'mdxJsxAttribute', name: 'class', value: 'wiki-diagram' }],
		children: [
			{
				type: 'mdxFlowExpression',
				value: `${UNSAFE_HTML_IDENTIFIER}(${JSON.stringify(svg)})`,
				data: {
					estree: {
						type: 'Program',
						sourceType: 'module',
						body: [
							{
								type: 'ExpressionStatement',
								expression: {
									type: 'CallExpression',
									optional: false,
									callee: { type: 'Identifier', name: UNSAFE_HTML_IDENTIFIER },
									arguments: [{ type: 'Literal', value: svg }],
								},
							},
						],
					},
				},
			},
		],
	} as MermaidNode;
}

/**
 * Formats a Pele failure as `<file>:<line>:<column>`, with the line moved from the
 * diagram source to the page by offsetting it by the code fence position.
 */
function describePeleError(error: PeleError, filePath: string, fenceLine: number | undefined): string {
	const line = fenceLine === undefined ? error.line : fenceLine + error.line;
	return `Invalid Mermaid diagram at ${filePath}:${line}:${error.column}: ${error.message}`;
}

/**
 * Replaces ```mermaid code blocks with SVG rendered at build time by Pele.
 *
 * @remarks
 * Each diagram gets an `idPrefix` derived from the last two path segments (category and
 * page in the generated collection) and its index on the page, so ids stay unique within a page and stable between builds. Colours come
 * from `--pele-*` variables in the site CSS, so theme switches need no re-render.
 * Invalid diagrams throw with the file and the page line and column.
 */
export function remarkMermaid() {
	return (tree: MermaidNode, file?: MermaidFile) => {
		const filePath = file?.path ?? 'unknown file';
		const slug = filePath
			.replace(/\.[^./\\]+$/, '')
			.split(/[\\/]/)
			.slice(-2)
			.join('-')
			.replace(/[^a-zA-Z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		let index = 0;

		const visit = (parent: MermaidNode) => {
			parent.children?.forEach((child, childIndex) => {
				if (child.type === 'code' && child.lang === 'mermaid') {
					const idPrefix = `mermaid-${slug}-${index++}`;
					try {
						const { svg } = render(child.value ?? '', { idPrefix, responsive: true });
						parent.children![childIndex] = diagramElement(svg);
					} catch (error) {
						if (error instanceof PeleError) {
							throw new Error(describePeleError(error, filePath, child.position?.start.line), {
								cause: error,
							});
						}
						throw error;
					}
					return;
				}
				visit(child);
			});
		};

		visit(tree);
		if (index > 0) {
			tree.children?.unshift(unsafeHtmlImport);
		}
	};
}
