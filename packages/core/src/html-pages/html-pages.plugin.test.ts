import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getCompiledHtmlTemplate } from './html-page-module.ts';
import { HtmlPagesPlugin } from './html-pages.plugin.ts';

describe('HtmlPagesPlugin', () => {
	let rootDir: string;
	let appConfig: EcoPagesAppConfig;
	const at = (relativePath: string) => path.join(rootDir, relativePath);

	beforeEach(() => {
		rootDir = mkdtempSync(path.join(tmpdir(), 'eco-html-plugin-'));
		mkdirSync(at('src/pages/blog'), { recursive: true });
		mkdirSync(at('src/includes'), { recursive: true });
		appConfig = {
			rootDir,
			defaultMetadata: { title: 'Site', description: 'Default description' },
			absolutePaths: { srcDir: at('src'), pagesDir: at('src/pages'), includesDir: at('src/includes') },
		} as unknown as EcoPagesAppConfig;
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('compiles Pages and the html.html shell, and leaves other .html files to core', async () => {
		const plugin = new HtmlPagesPlugin();
		for (const file of ['src/pages/about.html', 'src/pages/blog/post.html', 'src/includes/other.html']) {
			writeFileSync(at(file), '<main>x</main>');
		}
		writeFileSync(at('src/includes/html.html'), '<html><head></head><body><!-- eco:children --></body></html>');
		const kindOf = async (file: string) =>
			getCompiledHtmlTemplate((await plugin.compilePageModule(at(file), appConfig))?.default)?.kind;

		expect(await kindOf('src/pages/about.html')).toBe('page');
		expect(await kindOf('src/pages/blog/post.html')).toBe('page');
		expect(await kindOf('src/includes/html.html')).toBe('shell');
		expect(plugin.compilePageModule(at('src/includes/other.html'), appConfig)).toBeUndefined();
		expect(plugin.compilePageModule(at('src/public/index.html'), appConfig)).toBeUndefined();
		expect(plugin.compilePageModule(at('src/pages-old/about.html'), appConfig)).toBeUndefined();
	});

	it('takes no route params', () => {
		expect(new HtmlPagesPlugin().routeParams).toBe(false);
	});
});
