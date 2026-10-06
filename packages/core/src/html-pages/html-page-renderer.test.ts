import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBuildRuntime } from '../build/runtime/build-runtime.ts';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { AssetProcessingService } from '../services/assets/asset-processing-service/asset-processing.service.ts';
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

	it('applies the Page head when render() is called directly', async () => {
		const file = write('src/pages/about.html', '<head><title>About</title></head><main>About</main>');

		const html = String(
			await renderPage(createRenderer(), file, getBuiltInHtmlShell() as EcoComponent<HtmlTemplateProps>),
		);

		expect(html).toContain('<title>About</title>');
		expect(html).toContain('<meta property="og:title" content="About">');
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

	it('keeps processed inline CSS that contains </style> inside its element', async () => {
		vi.mocked(assetService.processDependencies).mockResolvedValueOnce([
			{ kind: 'stylesheet', content: '.quote::after { content: "</STYLE>"; } .after { color: red; }' },
		] as never);
		const file = write(
			'src/pages/about.html',
			"<head><style>@import './quote.css';</style></head><main>About</main>",
		);

		const html = String(
			await renderPage(createRenderer(), file, getBuiltInHtmlShell() as EcoComponent<HtmlTemplateProps>),
		);

		expect(html.match(/<\/style>/gi)).toHaveLength(1);
		expect(html).toMatch(/<style>[^<]*<\\\/STYLE>[^<]*\.after \{ color: red; \}<\/style>/);
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

	describe('module scripts, built for real', () => {
		let renderer: HtmlPageRenderer;
		const X_BTN_DEFINE = /customElements\.define\(["']x-btn/;
		const scriptUrls = (html: string) =>
			[...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((match) => match[1]!);
		const readOutput = (url: string) => readFileSync(path.join(appConfig.absolutePaths.distDir, url), 'utf8');
		const outputsMatching = (pattern: RegExp) => {
			const distDir = appConfig.absolutePaths.distDir;
			return readdirSync(distDir, { recursive: true, encoding: 'utf8' }).filter(
				(name) => name.endsWith('.js') && pattern.test(readFileSync(path.join(distDir, name), 'utf8')),
			);
		};
		/** The URLs of `entryUrls` and every file they import statically, transitively. */
		const loadedUrls = (entryUrls: string[]) => {
			const loaded = new Set<string>();
			const visit = (url: string) => {
				if (loaded.has(url)) return;
				loaded.add(url);
				for (const [, specifier] of readOutput(url).matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
					visit(new URL(specifier!, `http://x${url}`).pathname);
				}
			};
			entryUrls.forEach(visit);
			return [...loaded];
		};
		const render = async (file: string) => {
			const shell = existsSync(appConfig.absolutePaths.htmlTemplatePath)
				? loadHtmlPageModule(appConfig, appConfig.absolutePaths.htmlTemplatePath).default
				: getBuiltInHtmlShell();
			return String(await renderPage(renderer, file, shell as EcoComponent<HtmlTemplateProps>));
		};
		const setup = async () => {
			appConfig = await finalizeEcoPagesConfig({ rootDir });
			installBuildRuntime(appConfig);
			renderer = new HtmlPageRenderer({
				appConfig,
				assetProcessingService: AssetProcessingService.createWithDefaultProcessors(appConfig),
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});
		};

		beforeEach(() => {
			write('src/components/x-btn.ts', "customElements.define('x-btn', class XBtn extends HTMLElement {});");
		});

		it('emits a module two scripts of one Page import once, imported by both', async () => {
			write('src/pages/header.ts', "import '../components/x-btn.ts';\nconsole.log('header');");
			write('src/pages/footer.ts', "import '../components/x-btn.ts';\nconsole.log('footer');");
			const file = write(
				'src/pages/index.html',
				'<head><script type="module" src="./header.ts"></script></head><main>Home</main><script type="module" src="./footer.ts"></script>',
			);
			await setup();

			const entryUrls = scriptUrls(await render(file));

			const definers = outputsMatching(X_BTN_DEFINE);
			expect(entryUrls).toHaveLength(2);
			expect(definers).toHaveLength(1);
			for (const url of entryUrls) {
				expect(loadedUrls([url])).toContain(`/${definers[0]}`);
			}
		});

		it('emits a module a shell script and a Page script import once', async () => {
			write('src/includes/router.ts', "import '../components/x-btn.ts';\nconsole.log('router');");
			write(
				'src/includes/html.html',
				'<html><head><script type="module" src="./router.ts"></script></head><body><!-- eco:children --></body></html>',
			);
			write('src/pages/counter.ts', "import '../components/x-btn.ts';\nconsole.log('counter');");
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./counter.ts"></script>',
			);
			await setup();

			const entryUrls = scriptUrls(await render(file));

			const definers = outputsMatching(X_BTN_DEFINE);
			expect(entryUrls).toHaveLength(2);
			expect(definers).toHaveLength(1);
			for (const url of entryUrls) {
				expect(loadedUrls([url])).toContain(`/${definers[0]}`);
			}
		});

		it('emits a package two scripts on different Pages import once, keeping each script URL', async () => {
			write('node_modules/tiny-pkg/package.json', '{ "name": "tiny-pkg", "type": "module", "main": "index.js" }');
			write('node_modules/tiny-pkg/index.js', "export const tiny = () => 'TINY_PKG_CODE';");
			write('src/components/store.ts', "import { tiny } from 'tiny-pkg';\nexport const items = [tiny()];");
			write('src/pages/widget.ts', "import { items } from '../components/store.ts';\nconsole.log(items);");
			write('src/pages/plain.ts', "import { tiny } from 'tiny-pkg';\nconsole.log(tiny());");
			const alone = write(
				'src/pages/alone.html',
				'<main>A</main><script type="module" src="./widget.ts"></script>',
			);
			const withPlain = write(
				'src/pages/with-plain.html',
				'<main>B</main><script type="module" src="./widget.ts"></script><script type="module" src="./plain.ts"></script>',
			);
			await setup();

			const [aloneWidget] = scriptUrls(await render(alone));
			const [withPlainWidget, plain] = scriptUrls(await render(withPlain));

			expect(withPlainWidget).toBe(aloneWidget);
			const packageFiles = outputsMatching(/TINY_PKG_CODE/);
			expect(packageFiles).toHaveLength(1);
			expect(loadedUrls([aloneWidget!])).toContain(`/${packageFiles[0]}`);
			expect(loadedUrls([plain!])).toContain(`/${packageFiles[0]}`);
		});

		it('loads no module that only another Page uses', async () => {
			write('src/components/shared.ts', "export const shared = 'SHARED_CODE';");
			write('src/components/dashboard-only.ts', "export const dashboardOnly = 'DASHBOARD_ONLY_CODE';");
			write('src/pages/home.ts', "import { shared } from '../components/shared.ts';\nconsole.log(shared);");
			write(
				'src/pages/dashboard.ts',
				"import { shared } from '../components/shared.ts';\nimport { dashboardOnly } from '../components/dashboard-only.ts';\nconsole.log(shared, dashboardOnly);",
			);
			write(
				'src/pages/dashboard-chart.ts',
				"import { dashboardOnly } from '../components/dashboard-only.ts';\nconsole.log('chart', dashboardOnly);",
			);
			const home = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./home.ts"></script>',
			);
			write(
				'src/pages/dashboard.html',
				'<main>Dashboard</main><script type="module" src="./dashboard.ts"></script><script type="module" src="./dashboard-chart.ts"></script>',
			);
			await setup();

			const loaded = loadedUrls(scriptUrls(await render(home)))
				.map(readOutput)
				.join('\n');

			expect(loaded).toContain('SHARED_CODE');
			expect(loaded).not.toContain('DASHBOARD_ONLY_CODE');
		});

		it('rebuilds an edited script while HMR is off outside production', async () => {
			const script = write('src/pages/counter.ts', "console.log('FIRST_VERSION');");
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./counter.ts"></script>',
			);
			await setup();
			const [first] = scriptUrls(await render(file));

			writeFileSync(script, "console.log('SECOND_VERSION_LONGER');");
			const [second] = scriptUrls(await render(file));

			expect(readOutput(first!)).toContain('FIRST_VERSION');
			expect(readOutput(second!)).toContain('SECOND_VERSION_LONGER');
		});

		it('builds again after a failed build once an imported module is fixed', async () => {
			write('src/components/broken.ts', 'export const broken = ;');
			write('src/pages/counter.ts', "import { broken } from '../components/broken.ts';\nconsole.log(broken);");
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./counter.ts"></script>',
			);
			await setup();
			await expect(render(file)).rejects.toThrow('Could not build the HTML Page module scripts');

			write('src/components/broken.ts', "export const broken = 'FIXED';");
			const [url] = scriptUrls(await render(file));

			expect(loadedUrls([url!]).map(readOutput).join('\n')).toContain('FIXED');
		});

		it('builds a script created after another Page was built', async () => {
			write('src/pages/about.ts', "console.log('about');");
			const about = write(
				'src/pages/about.html',
				'<main>About</main><script type="module" src="./about.ts"></script>',
			);
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./counter.ts"></script>',
			);
			await setup();
			await render(about);

			write('src/pages/counter.ts', "console.log('CREATED_LATER');");
			const [url] = scriptUrls(await render(file));

			expect(readOutput(url!)).toContain('CREATED_LATER');
		});

		it('renders a Page while another Page does not compile', async () => {
			write('src/pages/counter.ts', "console.log('counter');");
			write('src/pages/broken.html', '<head></head><head></head><main>Broken</main>');
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./counter.ts"></script>',
			);
			await setup();

			const [url] = scriptUrls(await render(file));

			expect(readOutput(url!)).toContain('counter');
		});

		it('rejects a module script that imports a stylesheet, naming the HTML file and the stylesheet', async () => {
			write('src/pages/styles.css', 'main { color: red; }');
			write('src/pages/main.ts', "import './styles.css';\nconsole.log('main');");
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./main.ts"></script>',
			);
			await setup();

			await expect(render(file)).rejects.toThrow(
				'src/pages/index.html: "./main.ts" imports src/pages/styles.css, which a module script cannot add to the Page. Load it with <link rel="stylesheet" href="./styles.css"> in src/pages/index.html instead.',
			);
		});

		it('renders another Page while one Page loads a script that imports a stylesheet', async () => {
			write('src/components/theme.css', 'main { color: red; }');
			write('src/components/theme.ts', "import './theme.css';\nexport const theme = 'dark';");
			write('src/pages/main.ts', "import { theme } from '../components/theme.ts';\nconsole.log(theme);");
			write('src/pages/counter.ts', "console.log('COUNTER_CODE');");
			const styled = write(
				'src/pages/styled.html',
				'<main>Styled</main><script type="module" src="./main.ts"></script>',
			);
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./counter.ts"></script>',
			);
			await setup();

			await expect(render(styled)).rejects.toThrow(
				'imports src/components/theme.css through src/components/theme.ts',
			);
			const [url] = scriptUrls(await render(file));

			expect(readOutput(url!)).toContain('COUNTER_CODE');
		});

		it('rejects every Page that loads a script importing a stylesheet', async () => {
			write('src/pages/styles.css', 'main { color: red; }');
			write('src/pages/main.ts', "import './styles.css';");
			const first = write(
				'src/pages/first.html',
				'<main>1</main><script type="module" src="./main.ts"></script>',
			);
			const second = write(
				'src/pages/second.html',
				'<main>2</main><script type="module" src="./main.ts"></script>',
			);
			await setup();

			await expect(render(first)).rejects.toThrow(
				'src/pages/first.html: "./main.ts" imports src/pages/styles.css',
			);
			await expect(render(second)).rejects.toThrow(
				'src/pages/second.html: "./main.ts" imports src/pages/styles.css',
			);
		});

		it('builds a script once the stylesheet import of a module it imports is removed', async () => {
			write('src/components/theme.css', 'main { color: red; }');
			const theme = write('src/components/theme.ts', "import './theme.css';\nexport const theme = 'dark';");
			write('src/pages/main.ts', "import { theme } from '../components/theme.ts';\nconsole.log(theme);");
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./main.ts"></script>',
			);
			await setup();
			await expect(render(file)).rejects.toThrow('imports src/components/theme.css');

			writeFileSync(theme, "export const theme = 'THEME_FIXED';");
			const [url] = scriptUrls(await render(file));

			expect(loadedUrls([url!]).map(readOutput).join('\n')).toContain('THEME_FIXED');
		});

		it('rejects a script that re-exports a stylesheet, and renders another Page', async () => {
			write('src/pages/styles.css', 'main { color: red; }');
			write('src/pages/main.ts', "export * from './styles.css';");
			write('src/pages/counter.ts', "console.log('COUNTER_CODE');");
			const styled = write(
				'src/pages/styled.html',
				'<main>S</main><script type="module" src="./main.ts"></script>',
			);
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./counter.ts"></script>',
			);
			await setup();

			await expect(render(styled)).rejects.toThrow('"./main.ts" imports src/pages/styles.css');
			expect(readOutput(scriptUrls(await render(file))[0]!)).toContain('COUNTER_CODE');
		});

		it('emits a separate entry for module scripts whose paths differ only by extension', async () => {
			write('src/pages/a.ts', "console.log('from ts');");
			write('src/pages/a.js', "console.log('from js');");
			const file = write(
				'src/pages/index.html',
				'<main>Home</main><script type="module" src="./a.ts"></script><script type="module" src="./a.js"></script>',
			);
			await setup();

			const [tsUrl, jsUrl] = scriptUrls(await render(file));

			expect(readOutput(tsUrl!)).toContain('from ts');
			expect(readOutput(jsUrl!)).toContain('from js');
		});
	});

	describe('module scripts with HMR', () => {
		const renderWithHmr = (file: string) =>
			renderPage(
				new HtmlPageRenderer({
					appConfig,
					assetProcessingService: {
						processDependencies: assetService.processDependencies,
						getHmrManager: () => ({ isEnabled: () => true }),
					} as unknown as AssetProcessingService,
					runtimeOrigin: 'http://localhost:3000',
					resolvedIntegrationDependencies: [],
				}),
				file,
				getBuiltInHtmlShell() as EcoComponent<HtmlTemplateProps>,
			).then(String);
		const page = (script: string) =>
			write('src/pages/index.html', `<main>Home</main><script type="module" src="./${script}"></script>`);

		it('rejects a module script that imports a stylesheet until the import is removed', async () => {
			write('src/pages/styles.css', 'main { color: red; }');
			const main = write('src/pages/main.ts', "import './styles.css';\nconsole.log('main');");
			const file = page('main.ts');

			await expect(renderWithHmr(file)).rejects.toThrow(
				'src/pages/index.html: "./main.ts" imports src/pages/styles.css',
			);
			writeFileSync(main, "console.log('main without the stylesheet');");

			expect(await renderWithHmr(file)).toContain('<script type="module" src="/assets/main.ts">');
		});

		it('renders a script that imports a stylesheet as a string', async () => {
			write('src/pages/styles.css', 'main { color: red; }');
			write(
				'src/pages/element.ts',
				"import styles from './styles.css';\nexport { default } from './styles.css';",
			);

			expect(await renderWithHmr(page('element.ts'))).toContain(
				'<script type="module" src="/assets/element.ts">',
			);
		});

		it('does not follow type-only imports', async () => {
			write('src/pages/styles.css', 'main { color: red; }');
			write('src/pages/types.ts', "import './styles.css';\nexport type Theme = 'dark';");
			write(
				'src/pages/main.ts',
				"import type { Theme } from './types.ts';\nimport { type Theme as T } from './types.ts';\nexport type { Theme as U } from './types.ts';\nconsole.log('main');",
			);

			expect(await renderWithHmr(page('main.ts'))).toContain('<script type="module" src="/assets/main.ts">');
		});

		it('allows a stylesheet import the component meta transform moves into Component Dependencies', async () => {
			appConfig.integrations.push({ name: 'test-string', extensions: ['.eco.ts'] } as never);
			write('src/components/card.css', '.card { color: red; }');
			write(
				'src/components/card.eco.ts',
				"import { eco } from '@ecopages/core';\nimport './card.css';\nexport const Card = eco.component({ render: () => '<div></div>' });",
			);
			write('src/pages/main.ts', "import { Card } from '../components/card.eco.ts';\nconsole.log(Card);");

			expect(await renderWithHmr(page('main.ts'))).toContain('<script type="module" src="/assets/main.ts">');
		});

		it('rejects a stylesheet re-export from a component file, which the component meta transform keeps', async () => {
			appConfig.integrations.push({ name: 'test-string', extensions: ['.eco.ts'] } as never);
			write('src/components/card.css', '.card { color: red; }');
			write(
				'src/components/card.eco.ts',
				"import { eco } from '@ecopages/core';\nexport * from './card.css';\nexport const Card = eco.component({ render: () => '<div></div>' });",
			);
			write('src/pages/main.ts', "import { Card } from '../components/card.eco.ts';\nconsole.log(Card);");

			await expect(renderWithHmr(page('main.ts'))).rejects.toThrow('imports src/components/card.css');
		});

		it('rejects an empty named re-export of a stylesheet', async () => {
			write('src/pages/styles.css', 'main { color: red; }');
			write('src/pages/main.ts', "export {} from './styles.css';");

			await expect(renderWithHmr(page('main.ts'))).rejects.toThrow('"./main.ts" imports src/pages/styles.css');
		});

		it('rejects a package stylesheet, asking to copy it under the source directory', async () => {
			write(
				'node_modules/slider/package.json',
				'{ "name": "slider", "exports": { "./css": "./slider.css", "./raw.css": "./raw.css" } }',
			);
			write('node_modules/slider/slider.css', '.slider {}');
			write('src/pages/main.ts', "import 'slider/css';");
			write('src/pages/other.ts', "import 'unresolved-ui/style.css';");

			await expect(renderWithHmr(page('main.ts'))).rejects.toThrow(
				'"./main.ts" imports node_modules/slider/slider.css, which a module script cannot add to the Page. A <link> cannot point outside src, so copy the stylesheet under src and link it from src/pages/index.html instead.',
			);
			await expect(renderWithHmr(page('other.ts'))).rejects.toThrow(
				'"./other.ts" imports unresolved-ui/style.css, which a module script cannot add to the Page. A <link> cannot point outside src',
			);
		});
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
