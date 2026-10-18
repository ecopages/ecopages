import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eco, type EcoComponent, type HtmlTemplateProps } from '@ecopages/core';
import { createTestAppConfig } from '@ecopages/testing';
import { LitRenderer } from '../lit-renderer.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => `<html><body>${children}</body></html>`;

class TestLitRenderer extends LitRenderer {
	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return HtmlTemplate;
	}
}

const tempDirs: string[] = [];

/**
 * Builds a renderer whose work directory lives outside the source tree.
 *
 * @remarks
 * The compiled script keeps the `lit` import external, so the work directory
 * links the package's `node_modules` for Node to resolve it from there.
 */
async function createRenderer(): Promise<TestLitRenderer> {
	const workDir = await mkdtemp(path.join(tmpdir(), 'lit-ssr-lazy-preload-'));
	tempDirs.push(workDir);
	await symlink(path.join(PACKAGE_ROOT, 'node_modules'), path.join(workDir, 'node_modules'), 'dir');
	const appConfig = await createTestAppConfig({ rootDir: PACKAGE_ROOT, workDir });

	return new TestLitRenderer({
		appConfig,
		assetProcessingService: { processDependencies: vi.fn(async () => []) } as never,
		resolvedIntegrationDependencies: [],
	});
}

function createLazyHost(tagName: string, script: string): EcoComponent<object> {
	return eco.component<object, string>({
		integration: 'lit',
		identity: { id: tagName, file: path.join(FIXTURES_DIR, 'host.lit.ts'), integration: 'lit' },
		dependencies: {
			scripts: [{ src: `./${script}`, lazy: { 'on:interaction': 'click' }, ssr: true }],
		},
		render: () => `<${tagName} count="3"></${tagName}>`,
	}) as EcoComponent<object>;
}

afterEach(async () => {
	vi.restoreAllMocks();
	for (const dir of tempDirs.splice(0)) {
		await rm(dir, { recursive: true, force: true });
	}
});

describe('Lit SSR lazy script preload', () => {
	it('server-renders the shadow DOM of an element a lazy ssr script registers before a component-level render', async () => {
		const renderer = await createRenderer();

		const result = await renderer.renderComponent({
			component: createLazyHost('lit-ssr-lazy-component', 'ssr-lazy-component.script.ts'),
			props: {},
		});

		expect(result.html).toContain('<template shadowrootmode="open">');
		expect(result.html).toContain('data-ssr-lazy-component');
		expect(result.html).toContain('<!--lit-part-->3<!--/lit-part-->');
	});

	it('server-renders lazy custom elements used by the page, layout and route dependencies', async () => {
		const renderer = await createRenderer();
		const Page = eco.component<object, string>({
			integration: 'lit',
			identity: { id: 'lit-ssr-lazy-page', file: path.join(FIXTURES_DIR, 'host.lit.ts'), integration: 'lit' },
			dependencies: {
				scripts: [{ src: './ssr-lazy-page.script.ts', lazy: { 'on:interaction': 'click' }, ssr: true }],
			},
			render: () =>
				'<lit-ssr-lazy-page count="3"><lit-ssr-route-root count="4"></lit-ssr-route-root></lit-ssr-lazy-page>',
		});
		const Layout = eco.component<{ children: string }, string>({
			integration: 'lit',
			identity: { id: 'lit-ssr-lazy-layout', file: path.join(FIXTURES_DIR, 'host.lit.ts'), integration: 'lit' },
			dependencies: {
				scripts: [{ src: './ssr-lazy-layout.script.ts', lazy: { 'on:interaction': 'click' }, ssr: true }],
			},
			render: ({ children }) => `<lit-ssr-lazy-layout count="2"></lit-ssr-lazy-layout>${children}`,
		});
		const dependencyRoot = eco.component<object, string>({
			integration: 'lit',
			identity: { id: 'lit-ssr-route-root', file: path.join(FIXTURES_DIR, 'root.lit.ts'), integration: 'lit' },
			dependencies: {
				scripts: [{ src: './ssr-route-root.script.ts', lazy: { 'on:interaction': 'click' }, ssr: true }],
			},
			render: () => '<article></article>',
		});

		const result = await renderer.render({
			params: {},
			query: {},
			props: {},
			file: '/app/pages/index.lit.ts',
			resolvedDependencies: [],
			pageDependencyComponents: [dependencyRoot],
			metadata: { title: 'Page', description: 'Page' },
			Page,
			Layout,
			HtmlTemplate,
		});

		const html = await new Response(result as BodyInit).text();

		expect(html).toContain('data-ssr-lazy-page');
		expect(html).toContain('data-ssr-lazy-layout');
		expect(html).toContain('data-ssr-route-root');
	});
});
