import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
	EcoComponent,
	EcoFunctionComponent,
	EcoPagesAppConfig,
	HtmlTemplateProps,
	PageProps,
} from '@ecopages/core';
import { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import type { JsxRenderable } from '@ecopages/jsx';
import { test, vi } from 'vitest';
import { getEjsxHmrOwnership } from '../ecopages-jsx-hmr-ownership.ts';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer.ts';

const radiantEntryUrl = import.meta.resolve('@ecopages/radiant');
const radiantCustomElementEntryUrl = import.meta.resolve('@ecopages/radiant/decorators/custom-element');

const lightDomGlobalKeys = ['customElements', 'Element', 'HTMLElement', 'HTMLScriptElement', 'Node', 'window'] as const;

type LightDomGlobalKey = (typeof lightDomGlobalKeys)[number];

function createTestAssetProcessingService(appConfig: EcoPagesAppConfig): AssetProcessingService {
	const service = new AssetProcessingService(appConfig);
	vi.spyOn(service, 'processDependencies').mockResolvedValue([]);
	return service;
}

class TestEcopagesJsxRenderer extends EcopagesJsxRenderer {
	public async testResolvePageModule(file: string) {
		return this.pageModuleLoaderService.resolvePageModule({
			file,
			importPageFileFn: (targetFile) => this.importPageFile(targetFile),
		});
	}
}

function createScopedModuleUrl(moduleUrl: string, token: string): string {
	const scopedUrl = new URL(moduleUrl);
	scopedUrl.searchParams.set('ecopages-jsx-test', token);
	return scopedUrl.href;
}

function createAppConfig(rootDir: string): EcoPagesAppConfig {
	const appModuleLoader = {
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
			`import { RadiantElement, signal } from ${JSON.stringify(scopedRadiantEntryUrl)};`,
			`import { customElement } from ${JSON.stringify(scopedRadiantCustomElementEntryUrl)};`,
			'',
			'class TopLevelRadiantCounter extends RadiantElement {',
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
			'export function renderCounterSetupState() {',
			"\treturn customElements.get('top-level-radiant-counter') === TopLevelRadiantCounter ? 'radiant-module-ready' : 'missing';",
			'}',
		].join('\n'),
	);

	await writeFile(
		options.pagePath,
		[
			"import { renderCounterSetupState } from './counter-component.mjs';",
			'',
			'export default function Page() {',
			'\treturn renderCounterSetupState();',
			'}',
		].join('\n'),
	);
}

test('EcopagesJsxRenderer installs the Radiant light-dom environment before resolving JSX page modules', async () => {
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

		const appConfig = createAppConfig(tempDir);
		const renderer = new TestEcopagesJsxRenderer({
			appConfig,
			assetProcessingService: createTestAssetProcessingService(appConfig),
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
			assert.equal(html, 'radiant-module-ready');
			assert.equal(typeof globalThis.HTMLElement, 'function');
			assert.equal(typeof globalThis.customElements?.get('top-level-radiant-counter'), 'function');
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test('Radiant SSR host serialization loads through the documented public export', async () => {
	const radiantElementSsrRuntimeModuleUrl = import.meta.resolve('@ecopages/radiant/server/radiant-element-ssr');
	const radiantElementSsrRuntimeModule = await import(radiantElementSsrRuntimeModuleUrl);

	assert.equal(typeof radiantElementSsrRuntimeModule.resolveRadiantElementRenderBridge, 'function');
	assert.equal(typeof radiantElementSsrRuntimeModule.withServerRadiantElementSsrRuntime, 'function');
});

test('EcopagesJsxRenderer keeps MDX extension matching instance-owned', () => {
	const appConfigA = createAppConfig(tmpdir());
	const appConfigB = createAppConfig(tmpdir());
	const rendererA = new TestEcopagesJsxRenderer({
		appConfig: appConfigA,
		assetProcessingService: createTestAssetProcessingService(appConfigA),
		resolvedIntegrationDependencies: [],
		jsxConfig: {
			mdxExtensions: ['.docs.mdx'],
		},
		runtimeOrigin: 'http://localhost:3000',
	});
	const rendererB = new TestEcopagesJsxRenderer({
		appConfig: appConfigB,
		assetProcessingService: createTestAssetProcessingService(appConfigB),
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

test('EcopagesJsxRenderer records declared content dependencies for HMR ownership', async () => {
	const appConfig = createAppConfig(tmpdir());
	const renderer = new TestEcopagesJsxRenderer({
		appConfig,
		assetProcessingService: createTestAssetProcessingService(appConfig),
		resolvedIntegrationDependencies: [],
		jsxConfig: {},
		runtimeOrigin: 'http://localhost:3000',
	});
	const demo = (() => '<demo></demo>') as EcoComponent;
	demo.config = {
		identity: { id: 'demo', file: '/app/components/demo.tsx', integration: 'ecopages-jsx' },
	};
	const content = (() => '<article>Content</article>') as EcoComponent;
	content.config = {
		identity: { id: 'intro', file: '/app/content/docs/intro.mdx', integration: 'ecopages-jsx' },
		dependencies: { components: [demo] },
	};
	const page = (() => '<main>Page</main>') as EcoFunctionComponent<PageProps, JsxRenderable>;
	page.config = {
		identity: { id: 'page', file: '/app/pages/docs/[...slug]/index.tsx', integration: 'ecopages-jsx' },
	};
	const htmlTemplate = (({ children }: { children?: unknown }) => children) as EcoFunctionComponent<
		HtmlTemplateProps,
		JsxRenderable
	>;
	htmlTemplate.config = {
		identity: { id: 'html', file: '/app/html.tsx', integration: 'ecopages-jsx' },
	};

	await renderer.render({
		file: '/app/pages/docs/[...slug]/index.tsx',
		Page: page,
		HtmlTemplate: htmlTemplate,
		metadata: { title: '', description: '' },
		resolvedDependencies: [],
		resolvedPageDependencyComponents: [content],
	});

	const { fileOwners } = getEjsxHmrOwnership();
	assert.equal(fileOwners.has('/app/content/docs/intro.mdx'), true);
	assert.equal(fileOwners.has('/app/components/demo.tsx'), true);
});
