import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDiscoveredWatchFiles } from '../eco/discovered-dependencies.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { GetMetadataContext } from '../types/public-types.ts';
import { HTML_PAGES_INTEGRATION_NAME, isHtmlPageModuleFile, loadHtmlPageModule } from './html-page-module.ts';

describe('html-page-module', () => {
	let rootDir: string;
	let appConfig: EcoPagesAppConfig;

	beforeEach(() => {
		rootDir = mkdtempSync(path.join(tmpdir(), 'eco-html-module-'));
		mkdirSync(path.join(rootDir, 'src/pages'), { recursive: true });
		mkdirSync(path.join(rootDir, 'src/includes'), { recursive: true });
		appConfig = {
			rootDir,
			integrations: [{ name: HTML_PAGES_INTEGRATION_NAME }],
			defaultMetadata: { title: 'Site', description: 'Default description' },
			absolutePaths: {
				srcDir: path.join(rootDir, 'src'),
				pagesDir: path.join(rootDir, 'src/pages'),
				includesDir: path.join(rootDir, 'src/includes'),
			},
		} as unknown as EcoPagesAppConfig;
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('claims Pages and the html.html shell, and nothing else', () => {
		const at = (relativePath: string) => path.join(rootDir, relativePath);

		expect(isHtmlPageModuleFile(appConfig, at('src/pages/about.html'))).toBe(true);
		expect(isHtmlPageModuleFile(appConfig, at('src/pages/blog/post.html'))).toBe(true);
		expect(isHtmlPageModuleFile(appConfig, at('src/includes/html.html'))).toBe(true);
		expect(isHtmlPageModuleFile(appConfig, at('src/includes/other.html'))).toBe(false);
		expect(isHtmlPageModuleFile(appConfig, at('src/public/index.html'))).toBe(false);
		expect(isHtmlPageModuleFile(appConfig, at('src/pages-old/about.html'))).toBe(false);
		expect(isHtmlPageModuleFile(appConfig, at('src/pages/about.tsx'))).toBe(false);
		expect(
			isHtmlPageModuleFile(
				{ ...appConfig, integrations: [{ name: 'custom-html' }] } as unknown as EcoPagesAppConfig,
				at('src/pages/about.html'),
			),
		).toBe(false);
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
