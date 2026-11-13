import { describe, expect, it } from 'vitest';
import { transformModuleImports } from './ast-transform.ts';
import { normalizeRequestedExportsKey, type RequestedExportRules } from './specifier-classification.ts';

function transform(
	source: string,
	filename = '/app/component.tsx',
	options?: {
		globallyAllowed?: Map<string, Set<string> | '*'>;
		requestedExports?: Map<string, RequestedExportRules>;
	},
) {
	return transformModuleImports(
		source,
		filename,
		options?.globallyAllowed ?? new Map(),
		options?.requestedExports?.get(normalizeRequestedExportsKey(filename)),
	);
}

describe('transformModuleImports', () => {
	it('fails with the binding, its specifier and its position when a requested export uses a stripped import', () => {
		const source = [
			"import { authMiddleware } from './auth.server';",
			'export const guard = authMiddleware;',
			'export default eco.page({ middleware: [authMiddleware], render: () => null });',
		].join('\n');

		const requestedExports = new Map<string, RequestedExportRules>([['/app/src/widget', new Set(['guard'])]]);

		expect(() => transform(source, '/app/src/widget.tsx', { requestedExports })).toThrow(
			"'authMiddleware' (imported from './auth.server') is used at /app/src/widget.tsx:2:22",
		);
	});

	it('strips server-only Page options from modules outside pages and layouts', () => {
		const source = [
			"import { authMiddleware } from './auth.server';",
			'export default eco.page({ middleware: [authMiddleware], render: () => null });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/widget.tsx');

		expect(transformed).not.toContain('authMiddleware');
	});

	it('removes a chain of declarations and the imports only server-only options used', () => {
		const source = [
			"import { getPost } from './posts.server';",
			"import { format } from './format';",
			'const load = () => getPost();',
			'async function getProps() { return { post: format(await load()) }; }',
			'const unused = 1;',
			'export default eco.page({ props: getProps, render: () => null });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/pages/post.tsx');

		expect(transformed).not.toContain('getPost');
		expect(transformed).not.toContain('./format');
		expect(transformed).not.toContain('load');
		expect(transformed).not.toContain('getProps');
		expect(transformed).toContain('const unused = 1;');
		expect(transformed).toContain('eco.page({ render: () => null })');
	});

	it('keeps a declaration that kept code also uses', () => {
		const source = [
			"import { title } from './title';",
			'const heading = () => title;',
			'export default eco.page({ metadata: () => ({ title: heading() }), render: () => heading() });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/pages/index.tsx');

		expect(transformed).toContain("import { title } from './title';");
		expect(transformed).toContain('const heading = () => title;');
		expect(transformed).toContain('eco.page({ render: () => heading() })');
	});

	it('removes a declaration nothing references that uses a stripped import', () => {
		const source = [
			"import fs from 'node:fs';",
			'const unused = fs.existsSync("x");',
			'function readIt() { return fs.readFileSync("x"); }',
			'export default eco.page({ render: () => null });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/pages/index.tsx');

		expect(transformed).not.toContain('fs');
		expect(transformed).not.toContain('readIt');
		expect(transformed).toContain('eco.page({ render: () => null })');
	});

	it('replaces an export no browser importer uses that needs a stripped import', () => {
		const source = [
			"import { readdirSync } from 'node:fs';",
			'export function readPosts() { return readdirSync("posts"); }',
			'export const listPosts = () => readPosts();',
			'export const Button = eco.component({ render: () => null });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/components/button.tsx');

		expect(transformed).not.toContain('readdirSync');
		expect(transformed).toContain('export const readPosts = undefined;');
		expect(transformed).toContain('export const listPosts = undefined;');
		expect(transformed).toContain('export const Button = eco.component');
	});

	it('keeps a requested export that does not need a stripped import', () => {
		const source = [
			"import { readFileSync } from 'node:fs';",
			'export function formatDate(date) { return date.toISOString(); }',
			"export function dbSecretQuery() { return readFileSync('/etc/passwd', 'utf8'); }",
		].join('\n');
		const requestedExports = new Map<string, RequestedExportRules>([
			['/app/src/utils/mixed', new Set(['formatDate'])],
		]);

		const { transformed } = transform(source, '/app/src/utils/mixed.ts', { requestedExports });

		expect(transformed).toContain('export function formatDate');
		expect(transformed).toContain('export const dbSecretQuery = undefined;');
		expect(transformed).not.toContain('readFileSync');
	});

	it('replaces a named export that needs a stripped import when no request is known', () => {
		const source = [
			"import { readFileSync } from 'node:fs';",
			'export function formatDate(date) { return date.toISOString(); }',
			"export function dbSecretQuery() { return readFileSync('/etc/passwd', 'utf8'); }",
		].join('\n');

		const { transformed } = transform(source, '/app/src/utils/mixed.ts');

		expect(transformed).toContain('export function formatDate');
		expect(transformed).toContain('export const dbSecretQuery = undefined;');
		expect(transformed).not.toContain('readFileSync');
	});

	it('replaces a server-only export exposed through an export list', () => {
		const source = [
			"import { getPost } from './posts.server';",
			'async function loadPost() { return { post: await getPost() }; }',
			'export { loadPost };',
			'export default eco.page({ render: () => null });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/pages/post.tsx');

		expect(transformed).not.toContain('getPost');
		expect(transformed).toContain('const loadPost = undefined;');
		expect(transformed).toContain('export { loadPost };');
	});

	it('keeps an export that browser code uses', () => {
		const source = [
			'export async function loadTitle() { return { title: "Post" }; }',
			'export const describe = () => loadTitle();',
			'export default eco.page({ render: () => describe() });',
		].join('\n');

		expect(transform(source, '/app/src/pages/post.tsx').modified).toBe(false);
	});

	it('fails when a requested export reaches an export that needs a stripped import', () => {
		const source = [
			"import { getPost } from './posts.server';",
			'export async function loadTitle() { return { title: await getPost() }; }',
			'export const describe = () => loadTitle();',
			'export default eco.page({ render: () => null });',
		].join('\n');
		const requestedExports = new Map<string, RequestedExportRules>([
			['/app/src/pages/post', new Set(['describe'])],
		]);

		expect(() => transform(source, '/app/src/pages/post.tsx', { requestedExports })).toThrow(
			"'getPost' (imported from './posts.server') is used at /app/src/pages/post.tsx:2:59",
		);
	});

	it('does not treat a typeof check as a use of a stripped import', () => {
		const source = ["import fs from 'node:fs';", "export const hasFs = typeof fs !== 'undefined';"].join('\n');

		const { transformed } = transform(source);

		expect(transformed).toBe("\nexport const hasFs = typeof fs !== 'undefined';");
	});

	it('removes a side-effecting declaration only server-only options used, and keeps a top-level call', () => {
		const source = [
			"import { register } from './registry';",
			"const registered = register('server');",
			"register('browser');",
			'export default eco.page({ metadata: () => ({ title: registered }), render: () => null });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/pages/index.tsx');

		expect(transformed).not.toContain("register('server')");
		expect(transformed).toContain("register('browser');");
		expect(transformed).toContain("import { register } from './registry';");
	});

	it('fails when kept code uses a named import the declared rules remove', () => {
		const source = [
			"import { keepMe, dropMe } from 'left-pad';",
			"export const Component = eco.component({ dependencies: { modules: ['left-pad{keepMe}'] }, render: () => keepMe() });",
			'export default [Component, dropMe()];',
		].join('\n');

		expect(() => transform(source)).toThrow(
			"'dropMe' (imported from 'left-pad') is used at /app/component.tsx:3:28",
		);
	});

	it('removes trailing server-only options and their commas', () => {
		const source = [
			'export default eco.page({',
			'	render: () => null,',
			'	middleware: [],',
			"	cache: 'dynamic',",
			'});',
		].join('\n');

		const { transformed } = transform(source, '/app/src/pages/index.tsx');

		expect(transformed).toBe('export default eco.page({\n\trender: () => null,\n\t});');
	});

	it('does not treat type positions as uses of a stripped import', () => {
		const source = [
			"import { User, loadUser } from './user.server';",
			'export const toName = (user: User): string => (user as User).name;',
			'export default eco.page({ middleware: [loadUser], render: () => null });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/widget.tsx');

		expect(transformed).not.toContain('./user.server');
		expect(transformed).toContain('export const toName');
	});

	it('still transforms nested import() inside require() after handling the outer require call', () => {
		const source = [
			"const dynamicFs = require(import('node:fs'));",
			'const Component = eco.component({ render: () => null });',
			'export default Component;',
		].join('\n');

		const { transformed, modified } = transform(source);

		expect(modified).toBe(true);
		expect(transformed).not.toContain("import('node:fs')");
		expect(transformed).toContain('require(Promise.resolve({}))');
	});

	it('still transforms nested require() inside a non-literal import() after skipping the outer import()', () => {
		const source = [
			"const dynamicFs = import(require('node:fs'));",
			'const Component = eco.component({ render: () => null });',
			'export default Component;',
		].join('\n');

		const { transformed, modified } = transform(source);

		expect(modified).toBe(true);
		expect(transformed).not.toContain("require('node:fs')");
		expect(transformed).toContain('import(({}))');
	});

	it('strips unreachable forbidden imports without throwing', () => {
		const source = [
			"import fs from 'node:fs';",
			'const Component = eco.component({ render: () => null });',
			'export default Component;',
		].join('\n');

		const { transformed, modified } = transform(source);

		expect(modified).toBe(true);
		expect(transformed).not.toContain("import fs from 'node:fs'");
		expect(transformed).toContain('eco.component');
	});

	it('throws when a forbidden import is reachable from render', () => {
		const source = [
			"import fs from 'node:fs';",
			'const Component = eco.component({ render: () => fs.readFileSync("x") });',
			'export default Component;',
		].join('\n');

		expect(() => transform(source)).toThrow('Forbidden client import');
	});

	it('keeps only declared named specifiers on a reachable import', () => {
		const source = [
			"import { keepMe, dropMe } from 'left-pad';",
			"const Component = eco.component({ dependencies: { modules: ['left-pad{keepMe}'] }, render: () => keepMe() });",
			'export default Component;',
		].join('\n');

		const { transformed, modified } = transform(source);

		expect(modified).toBe(true);
		expect(transformed).toContain("import { keepMe } from 'left-pad';");
		expect(transformed).not.toContain('dropMe');
	});

	it('strips server-only eco.page options when requested', () => {
		const source = [
			'export default eco.page({',
			"\tcache: 'dynamic',",
			'\tmiddleware: [],',
			'\t"props": async () => ({}),',
			'\trender: () => null,',
			'});',
		].join('\n');

		const { transformed, modified } = transform(source, '/app/src/pages/index.tsx');

		expect(modified).toBe(true);
		expect(transformed).not.toContain('cache:');
		expect(transformed).not.toContain('middleware:');
		expect(transformed).not.toContain('props');
		expect(transformed).toContain('render: () => null');
	});

	it('does not strip computed eco.page option keys', () => {
		const source = [
			'const key = "middleware";',
			'export default eco.page({',
			'\t[key]: [],',
			'\trender: () => null,',
			'});',
		].join('\n');

		const { transformed, modified } = transform(source, '/app/src/pages/index.tsx');

		expect(modified).toBe(false);
		expect(transformed).toContain('[key]: []');
	});

	it('throws when a forbidden require is reachable from render', () => {
		const source = ['export default eco.page({', '\trender: () => require("node:fs"),', '});'].join('\n');

		expect(() => transform(source)).toThrow("Forbidden require('node:fs')");
	});

	it('stubs an unreachable forbidden require', () => {
		const source = ['const unused = require("node:fs");', 'export default eco.page({ render: () => null });'].join(
			'\n',
		);

		const { transformed, modified } = transform(source);

		expect(modified).toBe(true);
		expect(transformed).toContain('const unused = ({})');
		expect(transformed).not.toContain("require('node:fs')");
	});

	it('throws when a forbidden dynamic import is reachable from render', () => {
		const source = ['export default eco.page({', '\trender: () => import("node:fs"),', '});'].join('\n');

		expect(() => transform(source)).toThrow("Forbidden dynamic import('node:fs')");
	});

	it('still rewrites nested import() inside a reachable require() and then throws', () => {
		const source = ['export default eco.page({', '\trender: () => require(import("node:fs")),', '});'].join('\n');

		expect(() => transform(source)).toThrow("Forbidden dynamic import('node:fs')");
	});
});
