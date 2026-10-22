import type { JsxRenderable } from '@ecopages/jsx';
import type { Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

const SAFE_URL = /^(?:https?:|mailto:|\/|#|\.{1,2}\/)/i;

/** Keeps web, mail and relative URLs; drops `javascript:` and other schemes a post must not link to. */
function safeUrl(url: string): string | undefined {
	return SAFE_URL.test(url.trim()) ? url : undefined;
}

function renderChildren(node: Nodes): JsxRenderable[] {
	return 'children' in node ? node.children.map(renderNode) : [];
}

type Renderers = { [Type in Nodes['type']]?: (node: Extract<Nodes, { type: Type }>) => JsxRenderable };

/**
 * @remarks
 * Headings start at `h2`, since the post title is the page's `h1`. Raw HTML in a post renders as text.
 */
const renderers: Renderers = {
	paragraph: (node) => <p>{renderChildren(node)}</p>,
	heading: (node) => {
		const children = renderChildren(node);
		if (node.depth === 1) return <h2>{children}</h2>;
		if (node.depth === 2) return <h3>{children}</h3>;
		if (node.depth === 3) return <h4>{children}</h4>;
		if (node.depth === 4) return <h5>{children}</h5>;
		return <h6>{children}</h6>;
	},
	emphasis: (node) => <em>{renderChildren(node)}</em>,
	strong: (node) => <strong>{renderChildren(node)}</strong>,
	delete: (node) => <del>{renderChildren(node)}</del>,
	inlineCode: (node) => <code>{node.value}</code>,
	code: (node) => (
		<pre>
			<code>{node.value}</code>
		</pre>
	),
	blockquote: (node) => <blockquote>{renderChildren(node)}</blockquote>,
	list: (node) =>
		node.ordered ? (
			<ol start={node.start ?? undefined}>{renderChildren(node)}</ol>
		) : (
			<ul>{renderChildren(node)}</ul>
		),
	listItem: (node) => (
		<li>
			{node.spread
				? renderChildren(node)
				: node.children.map((child) =>
						child.type === 'paragraph' ? renderChildren(child) : renderNode(child),
					)}
		</li>
	),
	thematicBreak: () => <hr />,
	break: () => <br />,
	link: (node) => (
		<a href={safeUrl(node.url)} title={node.title ?? undefined}>
			{renderChildren(node)}
		</a>
	),
	image: (node) => {
		const src = safeUrl(node.url);
		return src ? <img src={src} alt={node.alt ?? ''} title={node.title ?? undefined} loading="lazy" /> : null;
	},
	table: (node) => (
		<table>
			<tbody>{renderChildren(node)}</tbody>
		</table>
	),
	tableRow: (node) => <tr>{renderChildren(node)}</tr>,
	tableCell: (node) => <td>{renderChildren(node)}</td>,
	text: (node) => node.value,
	html: (node) => node.value,
};

function renderNode(node: Nodes): JsxRenderable {
	const render = renderers[node.type] as ((node: Nodes) => JsxRenderable) | undefined;
	return render ? render(node) : renderChildren(node);
}

/** Renders a post's Markdown body as elements, without an HTML string in between. */
export function Markdown({ source }: { source: string }): JsxRenderable {
	const tree = fromMarkdown(source, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
	return renderChildren(tree);
}
