import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appLogger } from '../../../../global/app-logger.ts';
import { inlineStylesheetImports } from './app-stylesheet-imports.ts';

let rootDir: string;

function write(name: string, contents: string): string {
	const file = path.join(rootDir, name);
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, contents);
	return file;
}

beforeEach(() => {
	rootDir = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'app-stylesheet-imports-'))));
});

afterEach(() => {
	vi.restoreAllMocks();
	rmSync(rootDir, { recursive: true, force: true });
});

describe('inlineStylesheetImports', () => {
	it('returns the stylesheet as it is when it has no @import', () => {
		const entry = write('src/main.css', '.a { background: url(a.png); }');

		expect(inlineStylesheetImports('.a { background: url(a.png); }', entry)).toEqual({
			css: '.a { background: url(a.png); }',
			dependencies: [],
		});
	});

	it('inlines a relative @import and reports the partial as a dependency', () => {
		const partial = write('src/partials/a.css', '.a { color: red; }');
		const entry = write('src/main.css', "@import './partials/a.css';\n.main {}");

		expect(inlineStylesheetImports("@import './partials/a.css';\n.main {}", entry)).toEqual({
			css: '.a { color: red; }\n.main {}',
			dependencies: [partial],
		});
	});

	it('reads url() and bare specifiers as relative, as a browser does', () => {
		write('src/a.css', '.a {}');
		write('src/b.css', '.b {}');
		const entry = write('src/main.css', '');

		expect(inlineStylesheetImports("@import 'a.css';\n@import url(b.css);", entry).css).toBe('.a {}\n.b {}');
	});

	it('rebases the references of a partial, and of the partials it imports, onto the stylesheet', () => {
		write('src/img/bg.png', 'png');
		write('src/partials/deep/icon.css', '.icon { background: url(../../img/bg.png); }');
		write('src/partials/a.css', "@import './deep/icon.css';\n.a { background: url('../img/bg.png') }");
		const entry = write('src/styles/main.css', '');

		const { css } = inlineStylesheetImports("@import '../partials/a.css';\n.m { background: url(m.png) }", entry);

		expect(css).toBe(
			[
				'.icon { background: url("../img/bg.png"); }',
				'.a { background: url("../img/bg.png") }',
				'.m { background: url(m.png) }',
			].join('\n'),
		);
	});

	it('wraps a partial in the layer, supports and media blocks of its conditions', () => {
		write('src/a.css', '.a {}');
		const entry = write('src/main.css', '');

		expect(inlineStylesheetImports("@import './a.css' layer(lib) screen;", entry).css).toBe(
			'@layer lib {\n@media screen {\n.a {}\n}\n}',
		);
	});

	it('hoists remote @imports and the first @charset above the inlined CSS', () => {
		write('src/a.css', '@charset "utf-8";\n.a {}\n@import url("https://cdn.example/font.css");');
		const entry = write('src/main.css', '');

		expect(inlineStylesheetImports("@import './a.css';\n.main {}", entry).css).toBe(
			'@charset "utf-8";\n@import url("https://cdn.example/font.css");\n\n.a {}\n\n.main {}',
		);
	});

	it('inlines a partial once, even when two stylesheets import it or they import each other', () => {
		write('src/a.css', "@import './b.css';\n.a {}");
		write('src/b.css', "@import './a.css';\n.b {}");
		const entry = write('src/main.css', '');

		const { css, dependencies } = inlineStylesheetImports(
			"@import './a.css';\n@import './b.css';\n.main {}",
			entry,
		);

		expect(css).toBe('\n.b {}\n.a {}\n\n.main {}');
		expect(dependencies).toHaveLength(2);
	});

	it('inlines through a symlinked partial, reporting the path as written', () => {
		const real = write('shared/real.css', '.real {}');
		mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		symlinkSync(real, path.join(rootDir, 'src', 'linked.css'));
		const entry = write('src/main.css', '');

		expect(inlineStylesheetImports("@import './linked.css';", entry)).toEqual({
			css: '.real {}',
			dependencies: [path.join(rootDir, 'src', 'linked.css')],
		});
	});

	it('warns about a missing partial, naming the importer, leaves the @import and reports the path to rebuild on', () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		const css = "@import './present.css';\n@import './missing.css';";
		write('src/present.css', '.present {}');
		const entry = write('src/main.css', css);

		const result = inlineStylesheetImports(css, entry);

		expect(result.css).toBe(".present {}\n@import './missing.css';");
		expect(result.dependencies).toEqual([
			path.join(rootDir, 'src', 'present.css'),
			path.join(rootDir, 'src', 'missing.css'),
		]);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]![0]).toContain(`@import "./missing.css" in ${entry}`);
		expect(warn.mock.calls[0]![0]).toContain('does not exist');
	});

	it('leaves the stylesheet alone, with a dependency, when the only partial is missing', () => {
		vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		const css = "@import './missing.css';\n.main {}";
		const entry = write('src/main.css', css);

		expect(inlineStylesheetImports(css, entry)).toEqual({
			css,
			dependencies: [path.join(rootDir, 'src', 'missing.css')],
		});
	});

	it('leaves a bare specifier that names no sibling for the Processor, without a warning', () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		const css = "@import 'tailwindcss';\n.main {}";
		const entry = write('src/main.css', css);

		expect(inlineStylesheetImports(css, entry)).toEqual({ css, dependencies: [] });
		expect(warn).not.toHaveBeenCalled();
	});

	it('never inlines a dotfile or a file that is not a stylesheet', () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		write('src/.secret.css', '.secret {}');
		write('src/data.txt', 'text');
		const css = "@import './.secret.css';\n@import './data.txt';";
		const entry = write('src/main.css', css);

		expect(inlineStylesheetImports(css, entry)).toEqual({ css, dependencies: [] });
		expect(warn).toHaveBeenCalledTimes(2);
	});

	it('leaves an @import with conditions it cannot read, with a warning', () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		write('src/a.css', '.a {}');
		const css = "@import './a.css' screen { };";
		const entry = write('src/main.css', css);

		expect(inlineStylesheetImports(css, entry).css).toBe(css);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot read the conditions'));
	});

	it('does not read an @import in a comment, a string or a block', () => {
		write('src/a.css', '.a {}');
		const css =
			'/* @import "./a.css"; */\n.x::before { content: "@import \'./a.css\';"; }\n@media print { @import "./a.css"; }';
		const entry = write('src/main.css', css);

		expect(inlineStylesheetImports(css, entry)).toEqual({ css, dependencies: [] });
	});
});
