import { describe, expect, it } from 'vitest';
import { transformModuleImports } from './ast-transform.ts';
import type { RequestedExportRules } from './boundary-cache.ts';

function transform(
	source: string,
	filename = '/app/component.tsx',
	options?: {
		globallyAllowed?: Map<string, Set<string> | '*'>;
		requestedExports?: Map<string, RequestedExportRules>;
		stripServerOnlyPageOptions?: boolean;
	},
) {
	return transformModuleImports(
		source,
		filename,
		options?.globallyAllowed ?? new Map(),
		options?.requestedExports ?? new Map(),
		options?.stripServerOnlyPageOptions ?? false,
	);
}

describe('transformModuleImports', () => {
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

		const { transformed, modified } = transform(source, '/app/src/pages/index.tsx', {
			stripServerOnlyPageOptions: true,
		});

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

		const { transformed, modified } = transform(source, '/app/src/pages/index.tsx', {
			stripServerOnlyPageOptions: true,
		});

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
