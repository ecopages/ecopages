import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EcoPagesAppConfig } from '@ecopages/core/internal-types';
import { test } from 'vitest';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer.ts';

const radiantEntryUrl = import.meta.resolve('@ecopages/radiant');
const radiantCustomElementEntryUrl = import.meta.resolve('@ecopages/radiant/decorators/custom-element');

const lightDomGlobalKeys = ['customElements', 'Element', 'HTMLElement', 'HTMLScriptElement', 'Node', 'window'] as const;

type LightDomGlobalKey = (typeof lightDomGlobalKeys)[number];

class TestEcopagesJsxRenderer extends EcopagesJsxRenderer {
	public async testResolvePageModule(file: string) {
		return this.resolvePageModule(file);
	}
}

function createScopedModuleUrl(moduleUrl: string, token: string): string {
	const scopedUrl = new URL(moduleUrl);
	scopedUrl.searchParams.set('ecopages-jsx-test', token);
	return scopedUrl.href;
}

function createAppConfig(rootDir: string): EcoPagesAppConfig {
	const appModuleLoader = {
		owner: 'host',
		async importModule<T = unknown>(options: { filePath: string }): Promise<T> {
			const moduleUrl = pathToFileURL(options.filePath).href;
			return (await import(moduleUrl)) as T;
		},
		invalidateDevelopmentGraph(): void {
			return;
		},
	};

	return {
		defaultMetadata: {},
		rootDir,
		runtime: {
			appModuleLoader,
		},
	} as EcoPagesAppConfig;
}

async function withClearedLightDomGlobals<T>(run: () => Promise<T>): Promise<T> {
	const descriptors = new Map<LightDomGlobalKey, PropertyDescriptor | undefined>();

	for (const key of lightDomGlobalKeys) {
		descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		Reflect.deleteProperty(globalThis, key);
	}

	try {
		return await run();
	} finally {
		for (const key of lightDomGlobalKeys) {
			Reflect.deleteProperty(globalThis, key);
			const descriptor = descriptors.get(key);

			if (descriptor) {
				Object.defineProperty(globalThis, key, descriptor);
			}
		}
	}
}

async function writeRadiantFixture(options: {
	componentPath: string;
	pagePath: string;
	scriptPath: string;
	token: string;
}): Promise<void> {
	const scopedRadiantEntryUrl = createScopedModuleUrl(radiantEntryUrl, `${options.token}-root`);
	const scopedRadiantCustomElementEntryUrl = createScopedModuleUrl(
		radiantCustomElementEntryUrl,
		`${options.token}-decorator`,
	);

	await writeFile(
		options.scriptPath,
		[
			`import { RadiantComponent, signal } from ${JSON.stringify(scopedRadiantEntryUrl)};`,
			`import { customElement } from ${JSON.stringify(scopedRadiantCustomElementEntryUrl)};`,
			'',
			'class TopLevelRadiantCounter extends RadiantComponent {',
			'\trender() {',
			'\t\treturn `<button data-testid="radiant-counter">${this.$.count}</button>`;',
			'\t}',
			'}',
			"signal({ bind: true, hydrate: true, initial: 1 })(TopLevelRadiantCounter.prototype, 'count');",
			"customElement('top-level-radiant-counter')(TopLevelRadiantCounter);",
			'export { TopLevelRadiantCounter };',
		].join('\n'),
	);

	await writeFile(
		options.componentPath,
		[
			"import { TopLevelRadiantCounter } from './counter.script.mjs';",
			'',
			'export function renderCounterHost() {',
			"\treturn new TopLevelRadiantCounter().renderHostToString({ mode: 'hydrate' });",
			'}',
		].join('\n'),
	);

	await writeFile(
		options.pagePath,
		[
			"import { renderCounterHost } from './counter-component.mjs';",
			'',
			'export default function Page() {',
			'\treturn renderCounterHost();',
			'}',
		].join('\n'),
	);
}

test('EcopagesJsxRenderer installs the Radiant SSR runtime before resolving JSX page modules', async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), 'ecopages-jsx-renderer-'));
	const pagePath = path.join(tempDir, 'page.mjs');
	const componentPath = path.join(tempDir, 'counter-component.mjs');
	const scriptPath = path.join(tempDir, 'counter.script.mjs');

	try {
		await writeRadiantFixture({
			componentPath,
			pagePath,
			scriptPath,
			token: 'resolve-page-module',
		});

		const renderer = new TestEcopagesJsxRenderer({
			appConfig: createAppConfig(tempDir),
			assetProcessingService: {} as never,
			resolvedIntegrationDependencies: [],
			jsxConfig: {
				radiantSsrEnabled: true,
			},
			runtimeOrigin: 'http://localhost:3000',
		});

		await withClearedLightDomGlobals(async () => {
			assert.equal('HTMLElement' in globalThis, false);

			const pageModule = await renderer.testResolvePageModule(pagePath);
			const html = await (pageModule.Page as () => string | Promise<string>)();

			assert.equal(typeof pageModule.Page, 'function');
			assert.match(html, /<top-level-radiant-counter/);
			assert.match(html, /data-hydration/);
			assert.equal(typeof globalThis.HTMLElement, 'function');
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test('EcopagesJsxRenderer keeps MDX extension matching instance-owned', () => {
	const rendererA = new TestEcopagesJsxRenderer({
		appConfig: createAppConfig(tmpdir()),
		assetProcessingService: {} as never,
		resolvedIntegrationDependencies: [],
		jsxConfig: {
			mdxExtensions: ['.docs.mdx'],
		},
		runtimeOrigin: 'http://localhost:3000',
	});
	const rendererB = new TestEcopagesJsxRenderer({
		appConfig: createAppConfig(tmpdir()),
		assetProcessingService: {} as never,
		resolvedIntegrationDependencies: [],
		jsxConfig: {
			mdxExtensions: ['.guide.mdx'],
		},
		runtimeOrigin: 'http://localhost:3000',
	});

	assert.equal(rendererA.isMdxFile('/tmp/page.docs.mdx'), true);
	assert.equal(rendererA.isMdxFile('/tmp/page.guide.mdx'), false);
	assert.equal(rendererB.isMdxFile('/tmp/page.docs.mdx'), false);
	assert.equal(rendererB.isMdxFile('/tmp/page.guide.mdx'), true);
});
