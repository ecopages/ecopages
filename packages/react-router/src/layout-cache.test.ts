import { describe, expect, it } from 'vitest';
import type { ComponentIdentity } from '@ecopages/core';
import { createElement, type ReactNode } from 'react';
import {
	clearLayoutCache,
	getLayoutCache,
	getLayoutCacheKey,
	resolvePersistedLayout,
	resolvePersistedLayoutStack,
	type LayoutComponentWithMeta,
} from './layout-cache.ts';

function createLayout(options?: {
	displayName?: string;
	name?: string;
	renderLabel?: string;
	identity?: { id?: string; file?: string; integration?: string };
}): LayoutComponentWithMeta {
	const renderLabel = options?.renderLabel ?? 'default';
	const component = ((props: { children?: ReactNode }) =>
		createElement('div', { 'data-layout-render': renderLabel }, props.children)) as LayoutComponentWithMeta;
	if (options?.displayName) {
		component.displayName = options.displayName;
	}
	if (options?.identity?.file && options.identity.id) {
		component.config = {
			identity: {
				id: options.identity.id,
				file: options.identity.file,
				integration: options.identity.integration ?? 'react',
			},
		};
	}
	return component;
}

describe('getLayoutCacheKey', () => {
	it('uses injected __eco.file when available', () => {
		const layout = createLayout({
			identity: { file: '/app/src/layouts/base-layout.tsx', id: 'base', integration: 'react' },
		});

		expect(getLayoutCacheKey(layout)).toBe('/app/src/layouts/base-layout.tsx');
	});

	it('uses injected __eco.id when file is absent', () => {
		const layout = createLayout();
		layout.config = {
			identity: { id: 'docs-layout', integration: 'react' } as ComponentIdentity,
		};

		expect(getLayoutCacheKey(layout)).toBe('docs-layout');
	});

	it('does not collide for eco.component wrappers when __eco.file distinguishes them', () => {
		const minimalLayout = createLayout({
			identity: { file: '/app/src/layouts/minimal-layout.tsx', id: 'minimal', integration: 'react' },
		});
		const appLayout = createLayout({
			identity: { file: '/app/src/layouts/app-layout.tsx', id: 'app', integration: 'react' },
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

const originalWindow = globalThis.window;

function withLayoutCacheWindow(run: () => void) {
	const hadWindow = 'window' in globalThis;
	globalThis.window = globalThis as unknown as Window & typeof globalThis;
	try {
		run();
	} finally {
		if (hadWindow) {
			globalThis.window = originalWindow;
		} else {
			Reflect.deleteProperty(globalThis, 'window');
		}
	}
}

describe('resolvePersistedLayout', () => {
	it('reuses the cached instance when refresh is false', () => {
		withLayoutCacheWindow(() => {
			clearLayoutCache();
			const firstLayout = createLayout({
				displayName: 'SharedLayout',
				identity: { file: '/app/layouts/shared.tsx', id: 'shared', integration: 'react' },
			});
			const secondLayout = createLayout({
				displayName: 'SharedLayout',
				renderLabel: 'v2',
				identity: { file: '/app/layouts/shared.tsx', id: 'shared', integration: 'react' },
			});

			const first = resolvePersistedLayout(firstLayout, false);
			const second = resolvePersistedLayout(secondLayout, false);

			expect(second.layout).toBe(first.layout);
			expect(second.key).toBe(first.key);
		});
	});

	it('replaces the cached instance when refresh is true and the import changed', () => {
		withLayoutCacheWindow(() => {
			clearLayoutCache();
			const firstLayout = createLayout({
				displayName: 'SharedLayout',
				identity: { file: '/app/layouts/shared.tsx', id: 'shared', integration: 'react' },
			});
			const secondLayout = createLayout({
				displayName: 'SharedLayout',
				renderLabel: 'v2',
				identity: { file: '/app/layouts/shared.tsx', id: 'shared', integration: 'react' },
			});

			resolvePersistedLayout(firstLayout, false);
			const refreshed = resolvePersistedLayout(secondLayout, true);

			expect(refreshed.layout).toBe(secondLayout);
		});
	});
});

describe('resolvePersistedLayoutStack', () => {
	it('caches each layout tier independently', () => {
		withLayoutCacheWindow(() => {
			clearLayoutCache();
			const outer = createLayout({
				displayName: 'OuterLayout',
				identity: { file: '/app/layouts/outer.tsx', id: 'outer', integration: 'react' },
			});
			const inner = createLayout({
				displayName: 'InnerLayout',
				identity: { file: '/app/layouts/inner.tsx', id: 'inner', integration: 'react' },
			});

			const firstStack = resolvePersistedLayoutStack([outer, inner], false);
			const outerReplacement = createLayout({
				displayName: 'OuterLayout',
				identity: { file: '/app/layouts/outer.tsx', id: 'outer', integration: 'react' },
			});
			const secondStack = resolvePersistedLayoutStack([outerReplacement, inner], false);

			expect(firstStack[0]?.key).toBe('/app/layouts/outer.tsx');
			expect(firstStack[1]?.key).toBe('/app/layouts/inner.tsx');
			expect(secondStack[0]?.layout).toBe(firstStack[0]?.layout);
			expect(secondStack[1]?.layout).toBe(firstStack[1]?.layout);
			expect(getLayoutCache().size).toBe(2);
		});
	});

	it('reuses the same cached parent when stacks share an outer layout key', () => {
		withLayoutCacheWindow(() => {
			clearLayoutCache();
			const parentFirstImport = createLayout({
				displayName: 'AppShell',
				identity: { file: '/app/layouts/app-shell.tsx', id: 'app-shell', integration: 'react' },
			});
			const parentSecondImport = createLayout({
				displayName: 'AppShell',
				renderLabel: 'reimported',
				identity: { file: '/app/layouts/app-shell.tsx', id: 'app-shell', integration: 'react' },
			});
			const docsInner = createLayout({
				displayName: 'DocsInner',
				identity: { file: '/app/layouts/docs-inner.tsx', id: 'docs-inner', integration: 'react' },
			});
			const settingsInner = createLayout({
				displayName: 'SettingsInner',
				identity: { file: '/app/layouts/settings-inner.tsx', id: 'settings-inner', integration: 'react' },
			});

			const docsStack = resolvePersistedLayoutStack([parentFirstImport, docsInner], false);
			const settingsStack = resolvePersistedLayoutStack([parentSecondImport, settingsInner], false);

			expect(docsStack[0]?.key).toBe('/app/layouts/app-shell.tsx');
			expect(settingsStack[0]?.layout).toBe(docsStack[0]?.layout);
			expect(settingsStack[1]?.layout).not.toBe(docsStack[1]?.layout);
			expect(getLayoutCache().size).toBe(3);
		});
	});
});
