import { RERUN_SRC_ATTR } from '@ecopages/core/client/navigation-scripts';

function getMetaHeadElementKey(el: Element): string | null {
	const name = el.getAttribute('name') || el.getAttribute('property') || el.getAttribute('http-equiv');
	return name ? `meta:${name}` : null;
}

function getLinkHeadElementKey(el: Element): string | null {
	const rel = el.getAttribute('rel');
	const href = el.getAttribute('href');
	if (rel === 'stylesheet' && href) {
		return `stylesheet:${href}`;
	}
	if (rel === 'icon' || rel === 'shortcut icon') {
		return 'favicon';
	}
	if (rel === 'canonical') {
		return 'canonical';
	}
	return href ? `link:${href}` : null;
}

function getScriptHeadElementKey(el: Element): string | null {
	const scriptId = el.getAttribute('data-eco-script-id') || el.getAttribute('id');
	if (scriptId) {
		return `script-id:${scriptId}`;
	}
	const src = el.getAttribute(RERUN_SRC_ATTR) || (el as HTMLScriptElement).src;
	return src ? `script:${src}` : null;
}

function getStyleHeadElementKey(el: Element): string | null {
	const dataId = el.getAttribute('data-eco-style');
	return dataId ? `style:${dataId}` : null;
}

/**
 * Computes a unique key for a head element to enable diffing.
 * Elements with the same key are considered the same across navigations.
 */
export function getHeadElementKey(el: Element): string | null {
	const tag = el.tagName.toLowerCase();

	switch (tag) {
		case 'title':
			return 'title';
		case 'meta':
			return getMetaHeadElementKey(el);
		case 'link':
			return getLinkHeadElementKey(el);
		case 'script':
			return getScriptHeadElementKey(el);
		case 'style':
			return getStyleHeadElementKey(el);
		default:
			return null;
	}
}
