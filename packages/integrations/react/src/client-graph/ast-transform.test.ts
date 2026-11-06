import { describe, expect, it } from 'vitest';
import { transformModuleImports } from './ast-transform.ts';
import type { RequestedExportRules } from './specifier-classification.ts';

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
		options?.requestedExports ?? new Map(),
	);
}

describe('transformModuleImports', () => {
	it('fails with the binding, its specifier and its position when kept code uses a stripped import', () => {
		const source = [
			"import { authMiddleware } from './auth.server';",
			'export const guard = authMiddleware;',
			'export default eco.page({ middleware: [authMiddleware], render: () => null });',
		].join('\n');

		expect(() => transform(source, '/app/src/widget.tsx')).toThrow(
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
			'async function staticProps() { return { props: { post: format(await load()) } }; }',
			'const unused = 1;',
			'export default eco.page({ staticProps, render: () => null });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/pages/post.tsx');

		expect(transformed).not.toContain('getPost');
		expect(transformed).not.toContain('./format');
		expect(transformed).not.toContain('load');
		expect(transformed).not.toContain('staticProps');
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

	it('fails for a declaration nothing references that uses a stripped import', () => {
		const source = [
			"import fs from 'node:fs';",
			'const unused = fs.existsSync("x");',
			'export default eco.page({ render: () => null });',
		].join('\n');

		expect(() => transform(source, '/app/src/pages/index.tsx')).toThrow(
			"'fs' (imported from 'node:fs') is used at /app/src/pages/index.tsx:2:16",
		);
	});

	it('fails when kept code uses a named import the declared rules remove', () => {
		const source = [
			"import { keepMe, dropMe } from 'left-pad';",
			"export const Component = eco.component({ dependencies: { modules: ['left-pad{keepMe}'] }, render: () => keepMe() });",
			'export const padded = dropMe();',
		].join('\n');

		expect(() => transform(source)).toThrow(
			"'dropMe' (imported from 'left-pad') is used at /app/component.tsx:3:23",
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

	it('replaces legacy server-only Page exports with undefined', () => {
		const source = [
			"import { getPosts } from './posts.server';",
			'export async function getStaticPaths() { return { paths: await getPosts() }; }',
			'export const getMetadata = () => ({ title: String(getPosts) });',
			'export default eco.page({ render: () => null });',
		].join('\n');

		const { transformed } = transform(source, '/app/src/pages/index.tsx');

		expect(transformed).not.toContain('getPosts');
		expect(transformed).toContain('export const getStaticPaths = undefined;');
		expect(transformed).toContain('export const getMetadata = undefined;');
	});

	it('keeps getMetadata in a module that defines no Page', () => {
		const source = "export const getMetadata = () => ({ title: 'Docs' });";

		expect(transform(source, '/app/src/lib/metadata.ts').modified).toBe(false);
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
			'\t"staticProps": async () => ({}),',
			'\trender: () => null,',
			'});',
		].join('\n');

		const { transformed, modified } = transform(source, '/app/src/pages/index.tsx');

		expect(modified).toBe(true);
		expect(transformed).not.toContain('cache:');
		expect(transformed).not.toContain('middleware:');
		expect(transformed).not.toContain('staticProps');
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
