type TemplateContentShape = {
	strings: readonly string[];
	values?: readonly unknown[];
	[key: string]: unknown;
};

type MarkupNodeLikeShape = {
	nodeType: number;
	outerHTML?: string;
	childNodes?: readonly unknown[];
	textContent?: string;
	[key: string]: unknown;
};

function cloneTemplateStrings(strings: readonly string[], firstString: string): string[] {
	const nextStrings = [...strings];
	nextStrings[0] = firstString;

	const rawDescriptor = Object.getOwnPropertyDescriptor(strings, 'raw');
	if (rawDescriptor && Array.isArray(rawDescriptor.value)) {
		const rawStrings = [...rawDescriptor.value];
		rawStrings[0] = firstString;
		Object.defineProperty(nextStrings, 'raw', {
			...rawDescriptor,
			value: rawStrings,
		});
	}

	return nextStrings;
}

function cloneTemplateContentWithUpdatedFirstString<T extends TemplateContentShape>(
	content: T,
	firstString: string,
): T {
	const descriptors = Object.getOwnPropertyDescriptors(content);
	const clonedContent = Object.create(Object.getPrototypeOf(content)) as T;
	const stringsDescriptor = descriptors.strings;

	Object.defineProperties(clonedContent, {
		...descriptors,
		strings: {
			...stringsDescriptor,
			value: cloneTemplateStrings(content.strings, firstString),
		},
	});

	return clonedContent;
}

function cloneMarkupNodeLikeWithUpdatedOuterHtml<T extends MarkupNodeLikeShape>(content: T, outerHTML: string): T {
	const descriptors = Object.getOwnPropertyDescriptors(content);
	const clonedContent = Object.create(Object.getPrototypeOf(content)) as T;
	const outerHTMLDescriptor = descriptors.outerHTML;

	Object.defineProperties(clonedContent, {
		...descriptors,
		outerHTML: {
			configurable: outerHTMLDescriptor?.configurable ?? true,
			enumerable: outerHTMLDescriptor?.enumerable ?? true,
			writable: true,
			value: outerHTML,
		},
	});

	return clonedContent;
}

/**
 * Returns `true` when `value` is a thenable (Promise-like) object.
 *
 * Used to transparently handle both synchronous and asynchronous component
 * render results without requiring every caller to branch on `instanceof Promise`.
 *
 * @typeParam T Expected resolved type of the thenable.
 */
export function isThenable<T>(value: unknown): value is PromiseLike<T> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'then' in value &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

function isTemplateContentShape(value: unknown): value is TemplateContentShape {
	return (
		typeof value === 'object' &&
		value !== null &&
		Array.isArray((value as { strings?: unknown }).strings) &&
		(((value as { values?: unknown }).values ?? undefined) === undefined ||
			Array.isArray((value as { values?: unknown }).values))
	);
}

function isMarkupNodeLikeShape(value: unknown): value is MarkupNodeLikeShape {
	return (
		typeof value === 'object' && value !== null && typeof (value as { nodeType?: unknown }).nodeType === 'number'
	);
}

/** Returns whether a value looks like a DOM-like markup node from SSR integrations. */
export function isMarkupNodeLike(value: unknown): value is MarkupNodeLikeShape {
	return isMarkupNodeLikeShape(value);
}

function openingTagHasTriggerAttribute(str: string, insertAt: number): boolean {
	const rest = str.slice(insertAt);
	const end = rest.search(/\/?>/);
	const opening = end === -1 ? rest : rest.slice(0, end);
	return /(?:^|\s)data-eco-trigger=/.test(opening);
}

function injectTriggerAttributeIntoString(content: string, triggerId: string): StampedContent<string> {
	const str = content;
	let i = 0;

	while (i < str.length) {
		if (str[i] !== '<') {
			i++;
			continue;
		}

		const next = str[i + 1];

		if (next === '!' || next === '?') {
			const end = str.indexOf('>', i);
			if (end === -1) break;
			i = end + 1;
			continue;
		}

		if (next && /[a-zA-Z]/.test(next)) {
			const tagSlice = str.slice(i + 1);
			let nameEnd = tagSlice.search(/[\s/>]/);
			if (nameEnd === -1) {
				if (!/^[a-zA-Z][\w:-]*$/.test(tagSlice)) {
					break;
				}
				nameEnd = tagSlice.length;
			}
			const insertAt = i + 1 + nameEnd;
			if (openingTagHasTriggerAttribute(str, insertAt)) {
				return { content: str, reachedElement: true };
			}
			return {
				content: `${str.slice(0, insertAt)} data-eco-trigger="${triggerId}"${str.slice(insertAt)}`,
				reachedElement: true,
			};
		}

		break;
	}

	return { content: str, reachedElement: false };
}

type StampedContent<T> = {
	content: T;
	/** Whether an element opening tag was found, so later fragment siblings must stay untouched. */
	reachedElement: boolean;
};

function stampContent(content: unknown, triggerId: string): StampedContent<unknown> {
	if (Array.isArray(content)) {
		let reachedElement = false;
		const stamped = content.map((item: unknown) => {
			if (reachedElement) return item;
			const result = stampContent(item, triggerId);
			reachedElement = result.reachedElement;
			return result.reachedElement ? result.content : item;
		});
		return { content: stamped, reachedElement };
	}

	if (isTemplateContentShape(content)) {
		if (content.strings.length === 0) {
			return { content: String(content), reachedElement: false };
		}

		const first = injectTriggerAttributeIntoString(content.strings[0] ?? '', triggerId);
		return {
			content: cloneTemplateContentWithUpdatedFirstString(content, first.content),
			reachedElement: first.reachedElement,
		};
	}

	if (isMarkupNodeLikeShape(content) && typeof content.outerHTML === 'string') {
		const outer = injectTriggerAttributeIntoString(content.outerHTML, triggerId);
		return {
			content: cloneMarkupNodeLikeWithUpdatedOuterHtml(content, outer.content),
			reachedElement: outer.reachedElement,
		};
	}

	return injectTriggerAttributeIntoString(String(content), triggerId);
}

/**
 * Injects `data-eco-trigger` into the first real HTML element opening tag of
 * a component's rendered output string.
 *
 * The scan skips over leading whitespace, HTML comments (`<!-- -->`), CDATA
 * sections, and doctype declarations so that the attribute is always placed on
 * the first actual element — not spurious markup that can precede it.
 *
 * The insertion point is the end of the element's tag name, before any existing
 * attributes or the closing `>`, which produces output like:
 *
 * ```html
 * <my-element data-eco-trigger="eco-trigger-abc123" class="foo">…</my-element>
 * ```
 *
 * When no eligible opening tag is found the original string is returned
 * unchanged so callers never receive a broken fragment.
 *
 * An array (a JSX fragment) keeps its shape: the trigger goes on the first
 * element found in document order, skipping text, `null`, booleans and nested
 * arrays that hold no element, and later siblings are returned untouched.
 *
 * @remarks
 * `@ecopages/jsx` beta.8+ keeps attribute names in `parts`, so template
 * `strings[0]` is often just the opening tag name (`<html`) with no trailing
 * delimiter. In that shape the attribute is appended at the end of that string.
 *
 * @param content Rendered HTML string (or any value coercible to string).
 * @param triggerId Stable trigger identifier produced by `buildResolvedLazyTriggers`.
 */
export function addTriggerAttribute(content: string, triggerId: string): string;
export function addTriggerAttribute<T extends TemplateContentShape>(content: T, triggerId: string): T;
export function addTriggerAttribute<T extends MarkupNodeLikeShape>(content: T, triggerId: string): T;
export function addTriggerAttribute<T extends readonly unknown[]>(content: T, triggerId: string): T;
export function addTriggerAttribute(content: unknown, triggerId: string): unknown;
export function addTriggerAttribute(content: unknown, triggerId: string): unknown {
	return stampContent(content, triggerId).content;
}
