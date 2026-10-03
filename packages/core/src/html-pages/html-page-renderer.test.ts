import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import type { AssetProcessingService } from '../services/assets/asset-processing-service/asset-processing.service.ts';
import type { AssetDefinition } from '../services/assets/asset-processing-service/assets.types.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcoComponent, HtmlTemplateProps, IntegrationRendererRenderOptions } from '../types/public-types.ts';
import { getBuiltInHtmlShell, getCompiledHtmlTemplate, loadHtmlPageModule } from './html-page-module.ts';
import { HtmlPageRenderer } from './html-page-renderer.ts';

describe('HtmlPageRenderer', () => {
	let rootDir: string;
	let appConfig: EcoPagesAppConfig;
	let processed: AssetDefinition[];
	const at = (relativePath: string) => path.join(rootDir, relativePath);
	const write = (relativePath: string, source: string) => {
		mkdirSync(path.dirname(at(relativePath)), { recursive: true });
		writeFileSync(at(relativePath), source);
		return at(relativePath);
	};

	const assetService = {
		processDependencies: vi.fn(async (definitions: AssetDefinition[]) => {
			processed.push(...definitions);
			return definitions.map((definition) => ({
				kind: definition.kind,
				srcUrl: 'filepath' in definition ? `/assets/${path.basename(definition.filepath)}` : undefined,
				content: 'content' in definition ? definition.content : undefined,
			}));
		}),
	} as unknown as AssetProcessingService;

	const createRenderer = () =>
		new HtmlPageRenderer({
			appConfig,
			assetProcessingService: assetService,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});

	const renderPage = (renderer: HtmlPageRenderer, file: string, HtmlTemplate: EcoComponent<HtmlTemplateProps>) =>
		renderer.render({
			params: {},
			query: {},
			props: {},
			file,
			metadata: { title: 'Site', description: 'Site' },
			Page: loadHtmlPageModule(appConfig, file).default as IntegrationRendererRenderOptions['Page'],
			resolvedDependencies: [],
			HtmlTemplate,
		});

	beforeEach(async () => {
		rootDir = mkdtempSync(path.join(tmpdir(), 'eco-html-renderer-'));
		mkdirSync(at('src/pages'), { recursive: true });
		appConfig = await finalizeEcoPagesConfig({ rootDir });
		processed = [];
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('falls back to the built-in shell when the app has no html.html', async () => {
		const shell = await (createRenderer() as unknown as { getHtmlTemplate(): Promise<unknown> }).getHtmlTemplate();

		expect(getCompiledHtmlTemplate(shell)).toBe(getCompiledHtmlTemplate(getBuiltInHtmlShell()));
	});

	it('renders a Page inside the built-in shell', async () => {
		const file = write('src/pages/about.html', '<main>About</main>');

		const html = String(
			await renderPage(createRenderer(), file, getBuiltInHtmlShell() as EcoComponent<HtmlTemplateProps>),
		);

		expect(html).toMatch(/<body>\s*<main>About<\/main>\s*<\/body>/);
		expect(html).toContain('<meta charset="utf-8"');
	});

	it('wraps the Page in <body> when a JSX shell leaves <body> to its layouts', async () => {
		const file = write('src/pages/about.html', '<main>About</main>');
		const BodylessShell = (async ({ children }: HtmlTemplateProps) =>
			`<html><head><title>x</title></head>${children}</html>`) as EcoComponent<HtmlTemplateProps>;

		const html = String(await renderPage(createRenderer(), file, BodylessShell));

		expect(html).toMatch(/<body><main>About<\/main><\/body>/);
	});

	it('renders the html.html shell for a Page another Integration owns', async () => {
		write(
			'src/includes/html.html',
			'<html><head></head><body><header>Site</header><!-- eco:children --></body></html>',
		);
		appConfig = await finalizeEcoPagesConfig({ rootDir });
		const shell = loadHtmlPageModule(appConfig, appConfig.absolutePaths.htmlTemplatePath).default;

		const result = await createRenderer().renderComponent({
			component: shell,
			props: { children: '<main>From JSX</main>' },
		} as never);

		expect(result.html).toContain('<header>Site</header><main>From JSX</main>');
	});

	it('emits a stylesheet both the shell and the Page declare once, from the shell', async () => {
		write('src/styles/site.css', 'body { color: red; }');
		write(
			'src/includes/html.html',
			'<html><head><link rel="stylesheet" href="../styles/site.css"></head><body><!-- eco:children --></body></html>',
		);
		const file = write(
			'src/pages/about.html',
			'<head><link rel="stylesheet" href="../styles/site.css"></head><main>About</main>',
		);
		appConfig = await finalizeEcoPagesConfig({ rootDir });
		const shell = loadHtmlPageModule(appConfig, appConfig.absolutePaths.htmlTemplatePath).default;

		const html = String(await renderPage(createRenderer(), file, shell as EcoComponent<HtmlTemplateProps>));

		expect(html.match(/href="\/assets\/site\.css"/g)).toHaveLength(1);
	});

	it('names the HTML file and the reference when a local asset does not exist', async () => {
		const file = write(
			'src/pages/about.html',
			'<head><link rel="stylesheet" href="./missing.css"></head><main>About</main>',
		);

		await expect(
			renderPage(createRenderer(), file, getBuiltInHtmlShell() as EcoComponent<HtmlTemplateProps>),
		).rejects.toThrow(`${file}: "./missing.css" does not exist`);
	});
});
