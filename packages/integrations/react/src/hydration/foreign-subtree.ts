/**
 * The element React renders in place of a Foreign Subtree, shared by the server render and the browser.
 *
 * @remarks
 * The server wraps each Foreign Subtree's HTML in this element; in the browser, a Component another Integration
 * owns renders the same element with that HTML as `dangerouslySetInnerHTML`, so hydration keeps the server DOM
 * instead of calling the Component's `render`. The module has no server or React imports, since the browser
 * bootstraps import it.
 *
 * @module
 */

import type { EcoComponent } from '@ecopages/core';

export const FOREIGN_SUBTREE_TAG = 'eco-foreign-subtree';
export const FOREIGN_SUBTREE_KEY_ATTRIBUTE = 'data-eco-foreign-key';
export const FOREIGN_SUBTREE_DISPLAY = 'contents';

function isPlainObject(value: object): value is Record<string, unknown> {
	const prototype = Object.getPrototypeOf(value);
	return (prototype === Object.prototype || prototype === null) && !('$$typeof' in value);
}

/**
 * Serializes the parts of `value` that both the server and the browser see the same way.
 *
 * @remarks
 * Functions, symbols, React elements and class instances are left out, as `JSON.stringify` leaves out functions:
 * their identity or minified name differs between the two builds. Object keys are sorted.
 */
function serializeStable(value: unknown): string | undefined {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
	if (typeof value !== 'object') return undefined;
	if (Array.isArray(value)) return `[${value.map((item) => serializeStable(item) ?? 'null').join(',')}]`;
	if (!isPlainObject(value)) return undefined;
	const entries = Object.keys(value)
		.sort()
		.flatMap((key) => {
			const serialized = serializeStable(value[key]);
			return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
		});
	return `{${entries.join(',')}}`;
}

/** 32-bit FNV-1a of `text`, in base 36. */
function hashText(text: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

/**
 * Names a Foreign Subtree by its Component's identity and its serializable props.
 *
 * @remarks
 * A browser render that does not hydrate, such as a client navigation, finds the server HTML of a Foreign Subtree
 * by this key, so the server and the browser must compute the same one. Two Foreign Subtrees that differ only in
 * props the key leaves out, such as React `children`, share a key, and the browser then takes the first one's HTML
 * for both.
 */
export function getForeignSubtreeKey(component: EcoComponent, props: Record<string, unknown>): string {
	return hashText(`${component.config?.identity?.id ?? ''}\u0000${serializeStable(props) ?? ''}`);
}

/** Wraps the server HTML of one Foreign Subtree in the element the browser keeps as is. */
export function renderForeignSubtreeBoundary(key: string, html: string): string {
	return `<${FOREIGN_SUBTREE_TAG} ${FOREIGN_SUBTREE_KEY_ATTRIBUTE}="${key}" style="display:${FOREIGN_SUBTREE_DISPLAY}">${html}</${FOREIGN_SUBTREE_TAG}>`;
}
