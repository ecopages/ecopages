import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eco, type EcoComponent, type HtmlTemplateProps } from '@ecopages/core';
import { Processor } from '@ecopages/core/processor';
import { createTestAppConfig } from '@ecopages/testing';
import { ensureLitDomShim } from '../dom-shim.ts';
import { LitRenderer } from '../lit-renderer.ts';
import { litPlugin } from '../lit.plugin.ts';

ensureLitDomShim();

const PACKAGE_ROOT = path.fromFileUrl(new URL('../..', import.meta.url));
const FIXTURES_DIR = path.fromFileUrl(new URL('./fixtures/', import.meta.url));

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => `<html><body>${children}</body></html>`;

class TestLitRenderer extends LitRenderer {
	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return HtmlTemplate;
	}
}

/** Compiles the one utility the fixture stylesheet uses, the way Tailwind compiles `@apply`. */
class ApplyProcessor extends Processor {
	async setup(): Promise<void> {}

	override async transformStylesheet(css: string): Promise<{ css: string }> {
		return { css: css.replace('@apply text-red;', 'color: rgb(255, 0, 0);') };
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
	const workDir = await mkdtemp(path.join(tmpdir(), 'lit-ssr-stylesheet-import-'));
	tempDirs.push(workDir);
	await symlink(path.join(PACKAGE_ROOT, 'node_modules'), path.join(workDir, 'node_modules'), 'dir');
	const appConfig = await createTestAppConfig({
		rootDir: PACKAGE_ROOT,
		workDir,
		configure: (config) => ({
			...config,
			integrations: [litPlugin()],
			processors: [
				new ApplyProcessor({ name: 'apply', capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }] }),
			],
		}),
	});

	return new TestLitRenderer({
		appConfig,
		assetProcessingService: { processDependencies: vi.fn(async () => []) } as never,
		resolvedIntegrationDependencies: [],
	});
}

afterEach(async () => {
	vi.restoreAllMocks();
	for (const dir of tempDirs.splice(0)) {
		await rm(dir, { recursive: true, force: true });
	}
});

describe('Lit SSR of a stylesheet imported as text', () => {
	it('renders the compiled stylesheet inside the declarative shadow root', async () => {
		const renderer = await createRenderer();
		const host = eco.component<object, string>({
			integration: 'lit',
			identity: { id: 'lit-ssr-styled', file: path.join(FIXTURES_DIR, 'styled.lit.ts'), integration: 'lit' },
			dependencies: {
				scripts: [{ src: './ssr-styled.script.ts', lazy: { 'on:interaction': 'click' }, ssr: true }],
			},
			render: () => '<lit-ssr-styled></lit-ssr-styled>',
		}) as EcoComponent<object>;

		const result = await renderer.renderComponent({ component: host, props: {} });
		const shadowRoot = /<template shadowrootmode="open">([\s\S]*?)<\/template>/.exec(result.html)?.[1];

		expect(shadowRoot).toMatch(/<style>[\s\S]*color: rgb\(255, 0, 0\);[\s\S]*<\/style>/);
		expect(shadowRoot).not.toContain('@apply');
		expect(shadowRoot).toContain('data-ssr-styled');
	});
});
