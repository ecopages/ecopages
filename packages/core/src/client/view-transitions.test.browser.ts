import { afterEach, describe, expect, it } from 'vitest';
import {
	applyViewTransitionNames,
	clearViewTransitionNames,
	documentHasNamedViewTransitions,
	ensureRootViewTransitionStyles,
	navigationHasNamedViewTransitions,
} from './view-transitions.ts';

describe('documentHasNamedViewTransitions', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('returns false when no markup is present', () => {
		expect(documentHasNamedViewTransitions(document)).toBe(false);
	});

	it('returns true when data-view-transition is present', () => {
		document.body.innerHTML = '<div data-view-transition="x"></div>';
		expect(documentHasNamedViewTransitions(document)).toBe(true);
	});

	it('navigation checks current or incoming document', () => {
		const incoming = new DOMParser().parseFromString(
			'<html><body><div data-view-transition="hero"></div></body></html>',
			'text/html',
		);
		expect(navigationHasNamedViewTransitions(document, incoming)).toBe(true);
	});
});

describe('ensureRootViewTransitionStyles', () => {
	afterEach(() => {
		document.getElementById('eco-vt-root-styles')?.remove();
		document.getElementById('eco-vt-dynamic-styles')?.remove();
		document.body.replaceChildren();
	});

	it('opts the document out of the root view-transition group without !important', () => {
		ensureRootViewTransitionStyles();

		const style = document.getElementById('eco-vt-root-styles');
		expect(style).not.toBeNull();
		expect(style?.hasAttribute('data-eco-persist')).toBe(true);
		expect(style?.textContent).toContain('view-transition-name: none');
		expect(style?.textContent).not.toContain('!important');
		expect(getComputedStyle(document.documentElement).viewTransitionName).toBe('none');
	});

	it('reuses a single style element', () => {
		ensureRootViewTransitionStyles();
		ensureRootViewTransitionStyles();

		expect(document.querySelectorAll('#eco-vt-root-styles')).toHaveLength(1);
	});
});

describe('applyViewTransitionNames with root styles', () => {
	afterEach(() => {
		document.getElementById('eco-vt-root-styles')?.remove();
		document.getElementById('eco-vt-dynamic-styles')?.remove();
		document.body.replaceChildren();
	});

	it('keeps root styles when clearing named morph styles', () => {
		ensureRootViewTransitionStyles();
		document.body.innerHTML = '<div data-view-transition="hero"></div>';
		applyViewTransitionNames();

		expect(document.getElementById('eco-vt-dynamic-styles')?.textContent).toContain('view-transition-old(hero)');
		expect(document.getElementById('eco-vt-root-styles')?.textContent).toContain('view-transition-name: none');

		clearViewTransitionNames();

		expect(document.getElementById('eco-vt-dynamic-styles')?.textContent).toBe('');
		expect(document.getElementById('eco-vt-root-styles')?.textContent).toContain('view-transition-name: none');
	});
});
