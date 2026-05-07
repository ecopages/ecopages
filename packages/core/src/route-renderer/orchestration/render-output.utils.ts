import type { EcoComponent } from '../../types/public-types.ts';
import { buildInjectorMapScript } from '../../eco/lazy-injector-map.ts';

type ResolvedLazyScriptGroups = Readonly<NonNullable<EcoComponent['config']>['_resolvedLazyScripts']>;

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

function cloneTemplateContentWithUpdatedFirstString<T extends TemplateContentShape>(content: T, firstString: string): T {
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

function wrapWithScriptsInjectorMarkup(content: string, injectorMapScript: string): string {
	return `<scripts-injector><script type="ecopages/injector-map">${injectorMapScript}</script>${content}</scripts-injector>`;
}

function cloneTemplateContentWithWrappedInjector<T extends TemplateContentShape>(
	content: T,
	injectorMapScript: string,
): T | string {
	if (content.strings.length === 0) {
		return wrapWithScriptsInjectorMarkup(String(content), injectorMapScript);
	}

	const nextStrings = [...content.strings];
	nextStrings[0] = wrapWithScriptsInjectorMarkup(nextStrings[0] ?? '', injectorMapScript);
	nextStrings[nextStrings.length - 1] = `${nextStrings[nextStrings.length - 1] ?? ''}</scripts-injector>`;

	const rawDescriptor = Object.getOwnPropertyDescriptor(content.strings, 'raw');
	if (rawDescriptor && Array.isArray(rawDescriptor.value)) {
		const rawStrings = [...rawDescriptor.value];
		rawStrings[0] = wrapWithScriptsInjectorMarkup(rawStrings[0] ?? '', injectorMapScript);
		rawStrings[rawStrings.length - 1] = `${rawStrings[rawStrings.length - 1] ?? ''}</scripts-injector>`;
		Object.defineProperty(nextStrings, 'raw', {
			...rawDescriptor,
			value: rawStrings,
		});
	}

	const descriptors = Object.getOwnPropertyDescriptors(content);
	const clonedContent = Object.create(Object.getPrototypeOf(content)) as T;
	const stringsDescriptor = descriptors.strings;

	Object.defineProperties(clonedContent, {
		...descriptors,
		strings: {
			...stringsDescriptor,
			value: nextStrings,
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
	return typeof value === 'object' && value !== null && typeof (value as { nodeType?: unknown }).nodeType === 'number';
}

function injectTriggerAttributeIntoString(content: string, triggerId: string): string {
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
			const nameEnd = tagSlice.search(/[\s/>]/);
			if (nameEnd === -1) break;
			const insertAt = i + 1 + nameEnd;
			return `${str.slice(0, insertAt)} data-eco-trigger="${triggerId}"${str.slice(insertAt)}`;
		}

		break;
	}

	return str;
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
 * @param content Rendered HTML string (or any value coercible to string).
 * @param triggerId Stable trigger identifier produced by `buildResolvedLazyTriggers`.
 */
export function addTriggerAttribute(content: string, triggerId: string): string;
export function addTriggerAttribute<T extends TemplateContentShape>(content: T, triggerId: string): T;
export function addTriggerAttribute<T extends MarkupNodeLikeShape>(content: T, triggerId: string): T;
export function addTriggerAttribute(content: unknown, triggerId: string): string | TemplateContentShape | MarkupNodeLikeShape;
export function addTriggerAttribute(content: unknown, triggerId: string): string | TemplateContentShape | MarkupNodeLikeShape {
	if (isTemplateContentShape(content)) {
		if (content.strings.length === 0) {
			return String(content);
		}

		return cloneTemplateContentWithUpdatedFirstString(
			content,
			injectTriggerAttributeIntoString(content.strings[0] ?? '', triggerId),
		);
	}

	if (isMarkupNodeLikeShape(content) && typeof content.outerHTML === 'string') {
		return cloneMarkupNodeLikeWithUpdatedOuterHtml(
			content,
			injectTriggerAttributeIntoString(content.outerHTML, triggerId),
		);
	}

	return injectTriggerAttributeIntoString(String(content), triggerId);
}

/**
 * Wraps rendered component output in a `<scripts-injector>` element that
 * carries an inline injector map for the legacy (non-global-injector) path.
 *
 * @param content Rendered component HTML.
 * @param lazyGroups Resolved lazy script groups attached to the component config.
 */
export function wrapWithScriptsInjector(
	content: string,
	lazyGroups: ResolvedLazyScriptGroups,
): string;
export function wrapWithScriptsInjector<T extends TemplateContentShape>(
	content: T,
	lazyGroups: ResolvedLazyScriptGroups,
): T | string;
export function wrapWithScriptsInjector<T extends MarkupNodeLikeShape>(
	content: T,
	lazyGroups: ResolvedLazyScriptGroups,
): T;
export function wrapWithScriptsInjector(
	content: unknown,
	lazyGroups: ResolvedLazyScriptGroups,
): string | TemplateContentShape | MarkupNodeLikeShape;
export function wrapWithScriptsInjector(
	content: unknown,
	lazyGroups: ResolvedLazyScriptGroups,
): string | TemplateContentShape | MarkupNodeLikeShape {
	const injectorMapScript = buildInjectorMapScript(lazyGroups ?? []);

	if (isTemplateContentShape(content)) {
		return cloneTemplateContentWithWrappedInjector(content, injectorMapScript);
	}

	if (isMarkupNodeLikeShape(content) && typeof content.outerHTML === 'string') {
		return cloneMarkupNodeLikeWithUpdatedOuterHtml(
			content,
			wrapWithScriptsInjectorMarkup(content.outerHTML, injectorMapScript),
		);
	}

	return wrapWithScriptsInjectorMarkup(String(content), injectorMapScript);
}

export function decodeHtmlEntities(value: string): string {
	let decoded = value;
	let previous: string | undefined;

	do {
		previous = decoded;
		decoded = decoded
			.replaceAll('&quot;', '"')
			.replaceAll('&#39;', "'")
			.replaceAll('&#x27;', "'")
			.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&amp;', '&');
	} while (decoded !== previous);

	return decoded;
}

export function normalizeBoundaryArtifactHtml(html: string): string {
	return html.replace(
		/&(?:amp;)?lt;eco-marker\b[\s\S]*?&(?:amp;)?gt;&(?:amp;)?lt;\/eco-marker&(?:amp;)?gt;/g,
		(marker) => decodeHtmlEntities(marker),
	);
}

export function inspectBoundaryArtifactHtml(html: string): {
	hasUnresolvedBoundaryArtifacts: boolean;
	normalizedHtml: string;
} {
	const normalizedHtml = normalizeBoundaryArtifactHtml(html);

	return {
		normalizedHtml,
		hasUnresolvedBoundaryArtifacts: normalizedHtml.includes('<eco-marker'),
	};
}
