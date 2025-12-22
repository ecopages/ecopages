/**
 * Manages DOM swapping and head merging during navigation
 * @module
 */

/**
 * Service for handling DOM manipulation during page transitions
 */
export class DomSwapper {
	/**
	 * Parse HTML string into a Document
	 */
	parseHTML(html: string): Document {
		const parser = new DOMParser();
		return parser.parseFromString(html, 'text/html');
	}

	/**
	 * Swap the current document body with the new one
	 */
	swapBody(newDocument: Document): void {
		document.body.replaceWith(newDocument.body.cloneNode(true) as HTMLBodyElement);
	}

	/**
	 * Merge new head with existing head, preserving stylesheets and scripts
	 */
	mergeHead(newHead: HTMLHeadElement): void {
		const currentHead = document.head;

		const currentStyles = new Set(
			Array.from(currentHead.querySelectorAll('link[rel="stylesheet"]')).map(
				(el) => (el as HTMLLinkElement).href,
			),
		);

		const currentScripts = new Set(
			Array.from(currentHead.querySelectorAll('script[src]')).map((el) => (el as HTMLScriptElement).src),
		);

		const toRemove: Element[] = [];
		for (const child of currentHead.children) {
			const tagName = child.tagName.toLowerCase();

			if (tagName === 'link' && (child as HTMLLinkElement).rel === 'stylesheet') {
				continue;
			}
			if (tagName === 'script' && (child as HTMLScriptElement).src) {
				continue;
			}

			if (tagName === 'title' || tagName === 'meta') {
				toRemove.push(child);
			}
		}

		for (const el of toRemove) {
			el.remove();
		}

		for (const child of newHead.children) {
			const tagName = child.tagName.toLowerCase();

			if (tagName === 'link' && (child as HTMLLinkElement).rel === 'stylesheet') {
				if (currentStyles.has((child as HTMLLinkElement).href)) {
					continue;
				}
			}

			if (tagName === 'script' && (child as HTMLScriptElement).src) {
				if (currentScripts.has((child as HTMLScriptElement).src)) {
					continue;
				}
			}

			currentHead.appendChild(child.cloneNode(true));
		}
	}
}
