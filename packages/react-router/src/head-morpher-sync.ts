import {
	isNonExecutableHeadScript,
	isRerunScript,
	shouldPersistExecutableInlineHeadScript,
} from '@ecopages/core/client/navigation-scripts';
import { getHeadElementKey } from './head-element-keys.ts';

const PRESERVE_SELECTORS = ['meta[charset]', '[data-eco-persist]'];

export function indexHeadChildrenByKey(head: HTMLHeadElement): Map<string, Element> {
	const elements = new Map<string, Element>();
	for (const element of Array.from(head.children)) {
		const key = getHeadElementKey(element);
		if (key) {
			elements.set(key, element);
		}
	}
	return elements;
}

function appendStylesheetLoadPromise(cloned: Element, stylesheetPromises: Promise<void>[]): void {
	if (cloned.tagName !== 'LINK' || (cloned as HTMLLinkElement).rel !== 'stylesheet') {
		return;
	}

	const loadPromise = new Promise<void>((resolve) => {
		(cloned as HTMLLinkElement).onload = () => resolve();
		(cloned as HTMLLinkElement).onerror = () => resolve();
	});
	stylesheetPromises.push(loadPromise);
}

function syncExistingHeadElement(key: string, currentEl: Element, newEl: Element): void {
	if (key === 'title' && currentEl.textContent !== newEl.textContent) {
		currentEl.textContent = newEl.textContent;
		return;
	}

	if (isNonExecutableHeadScript(newEl) && currentEl.textContent !== newEl.textContent) {
		currentEl.textContent = newEl.textContent;
		return;
	}

	if (key.startsWith('style:') && currentEl.textContent !== newEl.textContent) {
		currentEl.textContent = newEl.textContent;
	}
}

export function mergeIncomingHeadElements(input: {
	currentHead: HTMLHeadElement;
	newElements: Map<string, Element>;
	currentElements: Map<string, Element>;
	shouldSkipNewScript: (script: HTMLScriptElement) => boolean;
	stylesheetPromises: Promise<void>[];
}): void {
	for (const [key, newEl] of input.newElements) {
		if (isRerunScript(newEl)) {
			continue;
		}

		const currentEl = input.currentElements.get(key);
		if (!currentEl) {
			if (newEl.tagName === 'SCRIPT' && input.shouldSkipNewScript(newEl as HTMLScriptElement)) {
				continue;
			}

			const cloned = newEl.cloneNode(true) as Element;
			appendStylesheetLoadPromise(cloned, input.stylesheetPromises);
			input.currentHead.appendChild(cloned);
			continue;
		}

		syncExistingHeadElement(key, currentEl, newEl);
	}
}

export function appendAnonymousHeadElements(currentHead: HTMLHeadElement, newHead: HTMLHeadElement): void {
	for (const newEl of Array.from(newHead.children)) {
		const key = getHeadElementKey(newEl);
		if (!key && !isRerunScript(newEl)) {
			currentHead.appendChild(newEl.cloneNode(true));
		}
	}
}

export function collectRemovableHeadElements(
	currentElements: Map<string, Element>,
	newElements: Map<string, Element>,
): Element[] {
	const elementsToRemove: Element[] = [];

	for (const [key, element] of currentElements) {
		if (newElements.has(key)) {
			continue;
		}

		const shouldPreserve = PRESERVE_SELECTORS.some((selector) => element.matches(selector));
		if (!shouldPreserve && !shouldPersistExecutableInlineHeadScript(element)) {
			elementsToRemove.push(element);
		}
	}

	return elementsToRemove;
}
