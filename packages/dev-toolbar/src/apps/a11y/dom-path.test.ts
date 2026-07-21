import { describe, expect, it } from 'vitest';
import { buildDomPath, resolveDomPath } from './dom-path.ts';

type MockElement = {
	parentElement: MockElement | null;
	children: MockElement[];
	tagName: string;
};

function createMockElement(
	tagName: string,
	children: MockElement[] = [],
	parent: MockElement | null = null,
): MockElement {
	const element: MockElement = { tagName: tagName.toUpperCase(), children, parentElement: parent };
	for (const child of children) {
		child.parentElement = element;
	}
	return element;
}

function asElement(mock: MockElement): Element {
	return mock as unknown as Element;
}

function asDocument(root: MockElement): Document {
	return {
		documentElement: asElement(root),
	} as Document;
}

describe('dom path resolution', () => {
	it('round-trips a child-index path through the document tree', () => {
		const leaf = createMockElement('img');
		const body = createMockElement('body', [leaf]);
		const html = createMockElement('html', [body]);
		const doc = asDocument(html);

		const path = buildDomPath(asElement(leaf));
		expect(path).toEqual([0, 0]);
		expect(resolveDomPath(doc, path)).toBe(asElement(leaf));
	});
});
