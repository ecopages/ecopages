import { rewriteFirstElement } from '../services/html/html-rewriter.ts';
import { findElements, getAttribute, parseHtml, type HtmlElementNode } from '../services/html/html-source-parser.ts';
import { getHeadTagKey } from './html-page-template.ts';

/**
 * The parts of a rendered HTML Page that land outside the shell's children slot.
 */
export type RenderedHtmlPageHead = {
	file: string;
	/** Rendered Page head nodes in source order; deduplicated assets render as `''`. */
	nodes: Array<{ html: string; key?: string; charset?: string }>;
	/** Values as written in the Page; the rewriter only escapes `"` when it re-serializes them. */
	htmlAttributes: Record<string, string>;
	bodyAttributes: Record<string, string>;
};

/** Singletons that must precede the tags they affect, so a Page copy without a shell copy goes at the start of `<head>`. */
const EARLY_HEAD_KEYS = new Set(['charset', 'base']);

type HtmlEdit = { start: number; end: number; html: string };

function applyEdits(html: string, edits: HtmlEdit[]): string {
	let result = html;
	for (const edit of [...edits].sort((left, right) => right.start - left.start || right.end - left.end)) {
		result = `${result.slice(0, edit.start)}${edit.html}${result.slice(edit.end)}`;
	}
	return result;
}

function collectShellHeadTags(head: HtmlElementNode): Map<string, HtmlElementNode> {
	const shellTags = new Map<string, HtmlElementNode>();
	for (const child of head.children) {
		if (child.type !== 'element') continue;
		const key = getHeadTagKey(child);
		if (key && !shellTags.has(key)) shellTags.set(key, child);
	}
	return shellTags;
}

function assertMatchingCharset(page: RenderedHtmlPageHead, pageCharset: string | undefined, shellTag: HtmlElementNode) {
	const shellCharset = getAttribute(shellTag, 'charset')?.value.trim().toLowerCase();
	if (shellCharset !== pageCharset) {
		throw new Error(
			`[ecopages] ${page.file}: <meta charset="${pageCharset}"> conflicts with the Html shell charset "${shellCharset}".`,
		);
	}
}

function reconcileHead(html: string, page: RenderedHtmlPageHead): string {
	const head = findElements(parseHtml(html), (element) => element.tagName === 'head')[0];
	if (!head) return html;

	const shellTags = collectShellHeadTags(head);
	const edits: HtmlEdit[] = [];
	let early = '';
	let appended = '';

	for (const node of page.nodes) {
		if (!node.html) continue;
		const { key } = node;
		const shellTag = key ? shellTags.get(key) : undefined;

		if (shellTag && key === 'charset') {
			assertMatchingCharset(page, node.charset, shellTag);
		} else if (shellTag && key) {
			edits.push({ start: shellTag.start, end: shellTag.end, html: node.html });
			shellTags.delete(key);
		} else if (key && EARLY_HEAD_KEYS.has(key)) {
			early += node.html;
		} else {
			appended += node.html;
		}
	}

	if (early) edits.push({ start: head.startTagEnd, end: head.startTagEnd, html: early });
	if (appended) edits.push({ start: head.contentEnd, end: head.contentEnd, html: appended });
	return applyEdits(html, edits);
}

function mergeRootAttributes(html: string, tagName: string, attributes: Record<string, string>): string {
	if (Object.keys(attributes).length === 0) return html;

	return rewriteFirstElement(
		html,
		(element) => element.tagName === tagName,
		(element) => {
			for (const [name, value] of Object.entries(attributes)) {
				if (name !== 'class') {
					element.setAttribute(name, value);
					continue;
				}
				const classes = `${element.getAttribute('class') ?? ''} ${value}`.split(/\s+/).filter(Boolean);
				element.setAttribute('class', [...new Set(classes)].join(' '));
			}
		},
	);
}

/**
 * Applies a Page's head tags and root attributes to the rendered document.
 *
 * @remarks
 * Runs on the finalized document, after Integration and core head
 * contributions, so it treats an `html.html`, JSX, or React shell the same way.
 * A Page singleton (`<title>`, `<base>`, a keyed `<meta>`, the canonical link)
 * replaces the first shell tag with the same identity in place. A Page
 * `<meta charset>` matching the shell's is dropped; a Page charset or `<base>`
 * the shell lacks goes at the start of `<head>`. Every other Page head node is
 * inserted before `</head>` in source order. A document without `<head>` gets no
 * Page head nodes. Page `<html>` and `<body>` attributes replace shell values,
 * except `class`, whose tokens are joined.
 *
 * @throws When the Page `<meta charset>` names a different encoding than the shell.
 */
export function reconcileHtmlPageDocument(html: string, page: RenderedHtmlPageHead): string {
	const reconciled = reconcileHead(html, page);
	return mergeRootAttributes(
		mergeRootAttributes(reconciled, 'html', page.htmlAttributes),
		'body',
		page.bodyAttributes,
	);
}
