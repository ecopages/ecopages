import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetFactory } from '../../assets/asset-processing-service/index.ts';
import { Processor } from '../../plugins/processor.ts';
import { createStylesheetKinds } from '../../plugins/stylesheet-kinds.ts';
import { packagePageDependencies } from './page-dependency-bundling.ts';

let tempDir: string;

beforeEach(() => {
	vi.stubEnv('NODE_ENV', 'production');
	tempDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'page-dependency-bundling-')));
});

afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(tempDir, { recursive: true, force: true });
});

/** The asset sources after packaging two stylesheets: `content` for a bundle, `file` for two kept apart. */
function packagedSources(secondCss: string): string[] {
	const files = ['first.css', 'second.css'].map((name) => path.join(tempDir, name));
	writeFileSync(files[0]!, '.first {}');
	writeFileSync(files[1]!, secondCss);
	const dependencies = files.map((filepath) =>
		AssetFactory.createFileStylesheet({ filepath, attributes: { rel: 'stylesheet' } }),
	);
	return packagePageDependencies(dependencies, 'react', true, tempDir).map((dependency) => dependency.source);
}

describe('packagePageDependencies stylesheets', () => {
	it.each([
		['absolute and remote references', ".a { background: url('/img/a.png'), url(https://x/y.png), url(data:x); }"],
		['a remote @import', '@import url("https://cdn.example/font.css");\n.a {}'],
		['a url() in a string or comment', '.a::before { content: "url(a.png)"; } /* url(b.png) */'],
	])('bundles stylesheets whose only references are not files: %s', (_name, css) => {
		expect(packagedSources(css)).toEqual(['content']);
	});

	it.each([
		['a relative url()', '.a { background: url(a.png); }'],
		['a quoted relative url()', ".a { background: url('./a.png'); }"],
		['a relative @import', "@import './part.css';"],
		['a relative @import url()', '@import url(part.css) layer(x);'],
		['an image-set() string', '.a { background: image-set("a.png" 1x); }'],
	])('keeps stylesheets apart when one has %s', (_name, css) => {
		expect(packagedSources(css)).toEqual(['file', 'file']);
	});
});

describe('packagePageDependencies, for a CSS Module', () => {
	const scoping = createStylesheetKinds([
		new (class extends Processor {
			async setup(): Promise<void> {}
		})({ name: 'scoping', capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }] }),
	]);

	it('links a CSS Module on its own, since a bundle of the sources would not scope it', () => {
		const files = ['first.css', 'card.module.css', 'last.css'].map((name) => path.join(tempDir, name));
		for (const file of files) writeFileSync(file, '.a {}');
		const dependencies = files.map((filepath) =>
			AssetFactory.createFileStylesheet({ filepath, attributes: { rel: 'stylesheet' } }),
		);

		const packaged = packagePageDependencies(dependencies, 'react', true, tempDir, scoping);

		expect(packaged.map((dependency) => dependency.source)).toEqual(['file', 'file', 'file']);
	});

	it('still bundles the plain stylesheets that sit together', () => {
		const files = ['first.css', 'second.css', 'card.module.css'].map((name) => path.join(tempDir, name));
		for (const file of files) writeFileSync(file, '.a {}');
		const dependencies = files.map((filepath) =>
			AssetFactory.createFileStylesheet({ filepath, attributes: { rel: 'stylesheet' } }),
		);

		const packaged = packagePageDependencies(dependencies, 'react', true, tempDir, scoping);

		expect(packaged.map((dependency) => dependency.source)).toEqual(['content', 'file']);
	});
});
