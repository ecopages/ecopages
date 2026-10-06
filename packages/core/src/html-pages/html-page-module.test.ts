import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDiscoveredWatchFiles } from '../eco/discovered-dependencies.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { GetMetadataContext } from '../types/public-types.ts';
import { HTML_PAGES_INTEGRATION_NAME, loadHtmlPageModule } from './html-page-module.ts';

describe('html-page-module', () => {
	let rootDir: string;
	let appConfig: EcoPagesAppConfig;

	beforeEach(() => {
		rootDir = mkdtempSync(path.join(tmpdir(), 'eco-html-module-'));
		mkdirSync(path.join(rootDir, 'src/pages'), { recursive: true });
		mkdirSync(path.join(rootDir, 'src/includes'), { recursive: true });
		appConfig = {
			rootDir,
			defaultMetadata: { title: 'Site', description: 'Default description' },
			absolutePaths: {
				srcDir: path.join(rootDir, 'src'),
				pagesDir: path.join(rootDir, 'src/pages'),
				includesDir: path.join(rootDir, 'src/includes'),
				htmlTemplatePath: path.join(rootDir, 'src/includes/html.html'),
			},
		} as unknown as EcoPagesAppConfig;
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('warns about a relative image URL once per file revision in development', () => {
		vi.stubEnv('NODE_ENV', 'development');
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		const file = path.join(rootDir, 'src/pages/gallery.html');
		try {
			writeFileSync(file, '<main><img src="./photo.png" alt=""></main>');
			loadHtmlPageModule(appConfig, file);
			loadHtmlPageModule(appConfig, file);
			expect(warn).toHaveBeenCalledTimes(1);

			writeFileSync(file, '<main><img src="./photo-2.png" alt=""></main>');
			loadHtmlPageModule(appConfig, file);
			expect(warn).toHaveBeenCalledTimes(2);
		} finally {
			warn.mockRestore();
			vi.unstubAllEnvs();
		}
	});

	it('warns once per file revision about a relative poster and a relative og:image', () => {
		vi.stubEnv('NODE_ENV', 'development');
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		const file = path.join(rootDir, 'src/pages/video.html');
		try {
			writeFileSync(
				file,
				'<head><meta property="og:image" content="cover.png"></head><main><video poster="./frame.jpg"></video></main>',
			);
			loadHtmlPageModule(appConfig, file);
			loadHtmlPageModule(appConfig, file);

			expect(warn.mock.calls.map(([message]) => String(message).match(/(?:relative )?\w+="[^"]*"/)?.[0])).toEqual(
				['content="cover.png"', 'relative poster="./frame.jpg"'],
			);
		} finally {
			warn.mockRestore();
			vi.unstubAllEnvs();
		}
	});

	it('fails to load a Page whose inline module script imports a relative file, naming the file', () => {
		const file = path.join(rootDir, 'src/pages/inline.html');
		writeFileSync(file, `<main>Inline</main><script type="module">import './x.ts';</script>`);

		expect(() => loadHtmlPageModule(appConfig, file)).toThrow(
			`${file}: an inline <script type="module"> imports "./x.ts"`,
		);
	});

	it('merges Page head metadata over defaultMetadata', async () => {
		const file = path.join(rootDir, 'src/pages/about.html');
		writeFileSync(file, '<head><title>About</title></head><main>About</main>');

		const Page = loadHtmlPageModule(appConfig, file).default;
		const metadata = await Page.metadata?.({ appConfig } as GetMetadataContext);

		expect(metadata).toEqual({ title: 'About', description: 'Default description' });
		expect(Page.config?.identity).toMatchObject({ file, integration: HTML_PAGES_INTEGRATION_NAME });
	});

	it('registers the local assets a Page references as watch files on its identity', () => {
		const file = path.join(rootDir, 'src/pages/about.html');
		writeFileSync(
			file,
			'<head><link rel="stylesheet" href="./about.css"></head><script type="module" src="./a.ts"></script>',
		);

		const Page = loadHtmlPageModule(appConfig, file).default;

		expect(getDiscoveredWatchFiles(Page.config)).toEqual([
			path.join(rootDir, 'src/pages/about.css'),
			path.join(rootDir, 'src/pages/a.ts'),
		]);
	});

	it('compiles includes/html.html as a shell and rejects one without the children marker', () => {
		const file = path.join(rootDir, 'src/includes/html.html');
		writeFileSync(file, '<html><head></head><body></body></html>');

		expect(() => loadHtmlPageModule(appConfig, file)).toThrow('exactly one <!-- eco:children --> marker');
	});
});
