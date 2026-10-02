import type { Element, ElementContent, Root, RootContent } from 'hast';
import type { Plugin } from 'unified';

const SECTION_HEADINGS = new Set(['h2', 'h3', 'h4', 'h5', 'h6']);

function textContent(node: Root | RootContent | ElementContent): string {
	if (node.type === 'text') return node.value;
	if ('children' in node) return node.children.map(textContent).join('');
	return '';
}

/**
 * Slugifies heading text the way `RuiToc` does for headings without an id.
 *
 * @remarks
 * Matching the TOC keeps every fragment it generated before build-time ids
 * existed, including links readers already shared.
 */
export function slugifyHeadingText(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^\w-]/g, '');
}

function visitElements(node: Root | Element, visit: (element: Element) => void): void {
	for (const child of node.children) {
		if (child.type !== 'element') continue;
		visit(child);
		visitElements(child, visit);
	}
}

/**
 * Gives every section heading (`h2`–`h6`) a stable `id` at build time.
 *
 * @remarks
 * Without server-rendered ids, a link such as `/docs/core/pages#html-pages`
 * lands at the top of the page: the TOC only assigns ids after its module runs,
 * after the browser has already looked for the fragment. Explicit ids are kept.
 * Repeated slugs get `-2`, `-3`, … suffixes, as the TOC does.
 */
export const rehypeHeadingIds: Plugin<[], Root> = () => (tree) => {
	const usedIds = new Set<string>();
	visitElements(tree, (element) => {
		if (typeof element.properties?.id === 'string') usedIds.add(element.properties.id);
	});

	visitElements(tree, (element) => {
		if (!SECTION_HEADINGS.has(element.tagName) || element.properties?.id) return;

		const base = slugifyHeadingText(textContent(element)) || 'section';
		let id = base;
		for (let suffix = 2; usedIds.has(id); suffix++) id = `${base}-${suffix}`;
		usedIds.add(id);
		element.properties = { ...element.properties, id };
	});
};
