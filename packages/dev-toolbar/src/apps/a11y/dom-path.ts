/**
 * Builds a child-index path from the document root to `element`.
 *
 * @remarks Used to re-resolve audit targets after the live `Element` reference is dropped from cache.
 */
export function buildDomPath(element: Element): number[] {
	const path: number[] = [];
	let current: Element | null = element;

	while (current?.parentElement) {
		const parent: Element = current.parentElement;
		path.unshift([...parent.children].indexOf(current));
		current = parent;
	}

	return path;
}

/**
 * Walks a {@link buildDomPath} sequence from `doc.documentElement`.
 */
export function resolveDomPath(doc: Document, path: readonly number[]): Element | null {
	if (path.length === 0) {
		return null;
	}

	let current: Element = doc.documentElement;

	for (const index of path) {
		const child = current.children[index];
		if (!child) {
			return null;
		}
		current = child;
	}

	return current;
}
