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
	const workDir = await mkdtemp(path.join(tmpdir(), 'lit-ssr-route-resolved-preload-'));
	tempDirs.push(workDir);
	await symlink(path.join(PACKAGE_ROOT, 'node_modules'), path.join(workDir, 'node_modules'), 'dir');
	const appConfig = await createTestAppConfig({ rootDir: PACKAGE_ROOT, workDir });

	return new TestLitRenderer({
		appConfig,
		assetProcessingService: { processDependencies: vi.fn(async () => []) } as never,
		runtimeOrigin: 'http://localhost:3000',
		resolvedIntegrationDependencies: [],
	});
}

afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		await rm(dir, { recursive: true, force: true });
	}
});

describe('Lit SSR preload of route-resolved dependency roots', () => {
	it('keeps elements registered by a route-resolved root when the page is rendered', async () => {
		const renderer = await createRenderer();
		const Page = (() => '<lit-ssr-route-root count="3"></lit-ssr-route-root>') as unknown as EcoComponent<object>;
		const dependencyRoot = eco.component<object, string>({
			integration: 'lit',
			identity: { id: 'lit-ssr-route-root', file: path.join(FIXTURES_DIR, 'root.lit.ts'), integration: 'lit' },
			dependencies: {
				scripts: [{ src: './ssr-route-root.script.ts', lazy: { 'on:interaction': 'click' }, ssr: true }],
			},
			render: () => '<article></article>',
		}) as EcoComponent<object>;

		const body = await renderer.render({
			params: {},
			query: {},
			props: {},
			file: '/app/pages/index.lit.ts',
			resolvedDependencies: [],
			resolvedPageDependencyComponents: [dependencyRoot],
			metadata: { title: 'Page', description: 'Page' },
			Page,
			HtmlTemplate,
		});
		const html = await new Response(body as BodyInit).text();

		expect(html).toContain('<template shadowrootmode="open">');
		expect(html).toContain('data-ssr-route-root');
		expect(html).toContain('<!--lit-part-->3<!--/lit-part-->');
	});
});
