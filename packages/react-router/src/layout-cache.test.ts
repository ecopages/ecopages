import { describe, expect, it } from 'vitest';
import type { EcoInjectedMeta } from '@ecopages/core';
import { createElement, type ReactNode } from 'react';
import { getLayoutCacheKey, type LayoutComponentWithMeta } from './layout-cache.ts';

function createLayout(options?: {
	displayName?: string;
	name?: string;
	renderLabel?: string;
	__eco?: { id?: string; file?: string; integration?: string };
}): LayoutComponentWithMeta {
	const renderLabel = options?.renderLabel ?? 'default';
	const component = ((props: { children?: ReactNode }) =>
		createElement('div', { 'data-layout-render': renderLabel }, props.children)) as LayoutComponentWithMeta;
	if (options?.displayName) {
		component.displayName = options.displayName;
	}
	if (options?.__eco?.file && options.__eco.id) {
		component.config = {
			__eco: {
				id: options.__eco.id,
				file: options.__eco.file,
				integration: options.__eco.integration ?? 'react',
			},
		};
	}
	return component;
}

describe('getLayoutCacheKey', () => {
	it('uses injected __eco.file when available', () => {
		const layout = createLayout({
			__eco: { file: '/app/src/layouts/base-layout.tsx', id: 'base', integration: 'react' },
		});

		expect(getLayoutCacheKey(layout)).toBe('/app/src/layouts/base-layout.tsx');
	});

	it('uses injected __eco.id when file is absent', () => {
		const layout = createLayout();
		layout.config = {
			__eco: { id: 'docs-layout', integration: 'react' } as EcoInjectedMeta,
		};

		expect(getLayoutCacheKey(layout)).toBe('docs-layout');
	});

	it('does not collide for eco.component wrappers when __eco.file distinguishes them', () => {
		const minimalLayout = createLayout({
			__eco: { file: '/app/src/layouts/minimal-layout.tsx', id: 'minimal', integration: 'react' },
		});
		const appLayout = createLayout({
			__eco: { file: '/app/src/layouts/app-layout.tsx', id: 'app', integration: 'react' },
		});

		expect(Function.prototype.toString.call(minimalLayout)).toBe(Function.prototype.toString.call(appLayout));
		expect(getLayoutCacheKey(minimalLayout)).not.toBe(getLayoutCacheKey(appLayout));
	});

	it('reuses the same key for logically identical plain layouts imported from different modules', () => {
		const firstImport = createLayout({ displayName: 'BaseLayout' });
		const secondImport = createLayout({ displayName: 'BaseLayout' });

		expect(getLayoutCacheKey(firstImport)).toBe(getLayoutCacheKey(secondImport));
	});

	it('differentiates plain layouts that share a display name but differ in source', () => {
		const docsLayout = ((props: { children?: ReactNode }) =>
			createElement('div', { 'data-layout-render': 'docs' }, props.children)) as LayoutComponentWithMeta;
		docsLayout.displayName = 'layout';

		const homeLayout = ((props: { children?: ReactNode }) =>
			createElement('div', { 'data-layout-render': 'home' }, props.children)) as LayoutComponentWithMeta;
		homeLayout.displayName = 'layout';

		expect(getLayoutCacheKey(docsLayout)).not.toBe(getLayoutCacheKey(homeLayout));
	});
});
