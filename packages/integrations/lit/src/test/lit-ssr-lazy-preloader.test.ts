import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { eco, bindComponentIdentity } from '@ecopages/core';
import { LitSsrLazyPreloader } from '../lit-ssr-lazy-preloader.ts';

describe('LitSsrLazyPreloader', () => {
	it('prefers source imports when configured for Bun-style SSR preload', async () => {
		const processDependencies = vi.fn(async () => [
			{ filepath: '/app/.eco/assets/components/lit-counter.script.js' },
		]);
		const preloader = new LitSsrLazyPreloader({
			resolveDependencyPath: (_componentDir, sourcePath) => sourcePath,
			processDependencies,
			preferSourceImports: true,
		});

		const entrypoint = await preloader.resolveSsrPreloadEntrypoint('/app/src/components/lit-counter.script.ts');

		expect(entrypoint).toBe('/app/src/components/lit-counter.script.ts');
		expect(processDependencies).not.toHaveBeenCalled();
	});

	it('uses processed preload entrypoints when source imports are not preferred', async () => {
		const processDependencies = vi.fn(async () => [
			{ filepath: '/app/.eco/assets/components/lit-counter.script.js' },
		]);
		const preloader = new LitSsrLazyPreloader({
			resolveDependencyPath: (_componentDir, sourcePath) => sourcePath,
			processDependencies,
			preferSourceImports: false,
		});

		const entrypoint = await preloader.resolveSsrPreloadEntrypoint('/app/src/components/lit-counter.script.ts');

		expect(entrypoint).toBe('/app/.eco/assets/components/lit-counter.script.js');
		expect(processDependencies).toHaveBeenCalledTimes(1);
		expect(processDependencies).toHaveBeenCalledWith(
			[expect.objectContaining({ excludeFromHtml: true })],
			expect.any(String),
		);
	});
	it('finds SSR registration through inferred component dependencies', () => {
		const child = eco.component(
			bindComponentIdentity(
				{ id: 'child', file: '/app/child.lit.tsx', integration: 'lit' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './counter.ts', ssr: true, lazy: { 'on:visible': true } }] },
				},
			),
		);
		const page = eco.page(
			bindComponentIdentity(
				{ id: 'page', file: '/app/page.lit.tsx', integration: 'lit' },
				{ render: () => '' },
				{ components: () => [child], stylesheets: [] },
			),
		);
		const preloader = new LitSsrLazyPreloader({ resolveDependencyPath: (dir, source) => `${dir}/${source}` });
		expect(preloader.collectSsrPreloadScripts([page])).toEqual(['/app/./counter.ts']);
	});
	it('registers a cached script again when another integration replaces the registry', async () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'lit-registry-'));
		const script = path.join(directory, 'register.mjs');
		writeFileSync(script, "customElements.define('registry-counter', class extends HTMLElement {});");
		const originalRegistry = globalThis.customElements;
		const Registry = originalRegistry.constructor as new () => CustomElementRegistry;
		const preloader = new LitSsrLazyPreloader({
			resolveDependencyPath: (_dir, src) => src,
			preferSourceImports: true,
		});
		const child = eco.component(
			bindComponentIdentity(
				{ id: 'registry', file: path.join(directory, 'component.ts'), integration: 'lit' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: script, ssr: true, lazy: { 'on:visible': true } }] },
				},
			),
		);
		try {
			globalThis.customElements = new Registry();
			await preloader.preloadSsrLazyScripts([child]);
			expect(customElements.get('registry-counter')).toBeDefined();
			await preloader.preloadSsrLazyScripts([child]);
			globalThis.customElements = new Registry();
			await preloader.preloadSsrLazyScripts([child]);
			expect(customElements.get('registry-counter')).toBeDefined();
		} finally {
			globalThis.customElements = originalRegistry;
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
