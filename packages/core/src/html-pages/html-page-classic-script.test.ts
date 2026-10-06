import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBuildRuntime } from '../build/runtime/build-runtime.ts';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { FileScriptProcessor } from '../services/assets/asset-processing-service/processors/script/file-script.processor.ts';
import type { IHmrManager } from '../types/internal-types.ts';
import { resolveClassicScriptOptions } from './html-page-classic-script.ts';

describe('resolveClassicScriptOptions', () => {
	let dir: string;
	const page = '/app/src/pages/index.html';
	const write = (name: string, source: string) => {
		const filepath = path.join(dir, name);
		writeFileSync(filepath, source);
		return filepath;
	};

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), 'eco-classic-script-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
	});

	const compile = async (name: string, source: string) => {
		const filepath = write(name, source);
		const appConfig = await finalizeEcoPagesConfig({ rootDir: dir, srcDir: '.' });
		installBuildRuntime(appConfig);
		const processor = new FileScriptProcessor({ appConfig });
		const hmrManager = { isEnabled: () => true, registerScriptEntrypoint: vi.fn() };
		processor.setHmrManager(hmrManager as unknown as IHmrManager);
		const processed = await processor.process({
			kind: 'script',
			source: 'file',
			filepath,
			...resolveClassicScriptOptions(page, `./${name}`, filepath),
		});
		return { code: readFileSync(processed.filepath!, 'utf8'), hmrManager };
	};

	it.each(['legacy.js', 'greeting.ts', 'greeting.mts'])('compiles %s on its own as a classic script', (name) => {
		const filepath = write(name, 'var ready = true;');

		expect(resolveClassicScriptOptions(page, `./${name}`, filepath)).toEqual({ classic: true });
	});

	it.each(['development', 'production'])(
		'emits TypeScript whose globals and `this` survive, outside the HMR pipeline, in %s',
		async (nodeEnv) => {
			vi.stubEnv('NODE_ENV', nodeEnv);
			const { code, hmrManager } = await compile(
				'greeting.ts',
				'(function (root: any) { root.Lib = 1; })(this);\nfunction greet(name: string): string { return `Hi ${name}`; }',
			);
			const context = createContext({});
			new Script(code).runInContext(context);

			expect(hmrManager.registerScriptEntrypoint).not.toHaveBeenCalled();
			expect(code).not.toContain('__defProp');
			expect(context.Lib).toBe(1);
			expect(context.greet('Ada')).toBe('Hi Ada');
			expect(code.includes('name')).toBe(nodeEnv === 'development');
		},
	);

	it.each([
		[
			'an import',
			'helper.ts',
			"import { x } from './x.ts';\nconsole.log(x);",
			'uses import, export, import.meta or a top-level await',
		],
		['an export', 'shared.js', 'export const value = 1;', 'uses import, export, import.meta or a top-level await'],
		[
			'import.meta',
			'meta.ts',
			'console.log(import.meta.url);',
			'uses import, export, import.meta or a top-level await',
		],
		['JSX', 'widget.jsx', 'const node = <div />;', 'is JSX'],
		['TSX', 'widget.tsx', 'const node: unknown = <div />;', 'is JSX'],
		['import = require()', 'legacy.ts', 'import fs = require("fs");\nfs;', 'uses import x = require()'],
		[
			'a decorator',
			'decorated.ts',
			'function dec(target: unknown) { return target; }\n@dec class A {}',
			'needs the decorate runtime helper (for example, for a decorator)',
		],
		[
			'a relative import()',
			'lazy.js',
			"document.addEventListener('click', () => import('./chunk.js'));",
			'imports a relative file with import()',
		],
		[
			'a relative import() in a conditional',
			'pick.js',
			"const load = (a) => import(a ? './a.js' : './b.js');",
			'imports a relative file with import()',
		],
		[
			'a top-level await',
			'wait.ts',
			'await Promise.resolve();',
			'uses import, export, import.meta or a top-level await',
		],
	])('rejects a classic script with %s and asks for type="module"', (_label, name, source, reason) => {
		const filepath = write(name, source);

		expect(() => resolveClassicScriptOptions(page, `./${name}`, filepath)).toThrow(
			`${page}: "./${name}" ${reason}, which a classic script cannot. Add type="module" to its <script> tag.`,
		);
	});

	it('reports a plain syntax error without suggesting type="module"', () => {
		const filepath = write('broken.js', 'function broken( {');

		expect(() => resolveClassicScriptOptions(page, './broken.js', filepath)).toThrow(
			new RegExp(`^\\[ecopages\\] ${page}: "\\./broken\\.js" has a syntax error: (?!.*type="module")`),
		);
	});

	it.each([
		['a sloppy-mode script', 'legacy.js', '<!-- old browsers\nvar await = 1;'],
		[
			'a comment that mentions import = require()',
			'notes.ts',
			'// usage: import x = require("lib")\nvar ready = true;',
		],
	])('accepts %s', (_label, name, source) => {
		const filepath = write(name, source);

		expect(resolveClassicScriptOptions(page, `./${name}`, filepath)).toEqual({ classic: true });
	});

	it('keeps legal comments when minifying', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const { code } = await compile('vendor.js', '/*! tiny-lib v1 | MIT */\nfunction tiny(value) { return value; }');

		expect(code).toContain('/*! tiny-lib v1 | MIT */');
	});

	it('allows import() of an absolute URL', () => {
		const filepath = write(
			'lazy.js',
			"document.addEventListener('click', () => import('https://cdn.example/x.js'));",
		);

		expect(resolveClassicScriptOptions(page, './lazy.js', filepath)).toEqual({ classic: true });
	});
});
