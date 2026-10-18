import { isMarkupNodeLike } from '../../../eco/component-render-output.ts';

function isOpaqueForeignChildValue(children: unknown): boolean {
	if (children === null || typeof children !== 'object') {
		return false;
	}

	if (Array.isArray(children) || '$$typeof' in children) {
		return false;
	}

	if ('strings' in children && Array.isArray((children as { strings: unknown }).strings)) {
		return false;
	}

	if (isMarkupNodeLike(children)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(children);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Throws when foreign-path children would be coerced from an opaque object.
 */
export function assertForeignChildrenNotOpaque(children: unknown, context: string): void {
	if (!isOpaqueForeignChildValue(children)) {
		return;
	}

	const childTag = Object.prototype.toString.call(children);
	throw new TypeError(
		`[ecopages] ${context} refused to coerce opaque foreign children (${childTag}). Use EcoEmbed for cross-integration children or pass already-serialized HTML.`,
	);
}
