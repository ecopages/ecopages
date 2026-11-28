import { describe, expect, it } from 'vitest';
import { normalizePreservedModuleOutput, type PreservedModuleChunk } from './preserved-module-output.ts';

function chunk(fileName: string, code: string, extra: Partial<PreservedModuleChunk> = {}): PreservedModuleChunk {
	return { fileName, code, facadeModuleId: `/app/${fileName}`, dynamicImports: [], ...extra };
}

describe('normalizePreservedModuleOutput', () => {
	it('moves a namespace object out of the file that owns it and imports the real namespace where it is read', () => {
		const dep = chunk(
			'dep.js',
			[
				'import { __exportAll } from "./runtime.js";',
				'var dep_exports = /* @__PURE__ */ __exportAll({ a: () => "a" });',
				'const a = "a";',
				'export { a, dep_exports };',
				'',
			].join('\n'),
		);
		const user = chunk(
			'user.js',
			[
				'import { a, dep_exports as dep } from "./dep.js";',
				'export const keys = Object.keys(dep);',
				'export { dep };',
				'',
			].join('\n'),
		);

		const assets = normalizePreservedModuleOutput([dep, user], new Set());

		expect(assets).toEqual([]);
		expect(dep.code).toBe('const a = "a";\nexport { a };\n');
		expect(user.code).toContain('import { a } from "./dep.js";');
		expect(user.code).toContain('import * as dep from "./dep.js";');
		expect(user.code).not.toContain('dep_exports');
	});

	it('turns a namespace re-export of the owner into `export * as`', () => {
		const dep = chunk(
			'dep.js',
			'import { __exportAll } from "./runtime.js";\nvar dep_exports = /* @__PURE__ */ __exportAll({ a: () => "a" });\nconst a = "a";\nexport { a, dep_exports };\n',
		);
		const entry = chunk('entry.js', 'export { dep_exports as ns, a as first } from "./dep.js";\n');

		normalizePreservedModuleOutput([dep, entry], new Set());

		expect(dep.code).toBe('const a = "a";\nexport { a };\n');
		expect(entry.code).toContain('export { a as first } from "./dep.js";');
		expect(entry.code).toContain('export * as ns from "./dep.js";');
		expect(entry.code).not.toContain('dep_exports');
	});

	it('turns every namespace re-export of the owner into `export * as`, and keeps a quoted export name quoted', () => {
		const dep = chunk(
			'dep.js',
			'import { __exportAll } from "./runtime.js";\nvar dep_exports = /* @__PURE__ */ __exportAll({ a: () => "a" });\nconst a = "a";\nexport { a, dep_exports };\n',
		);
		const entry = chunk(
			'entry.js',
			'export { dep_exports as first, dep_exports as "foo-bar", dep_exports as second } from "./dep.js";\n',
		);

		normalizePreservedModuleOutput([dep, entry], new Set());

		expect(entry.code).toBe(
			'export * as first from "./dep.js";\nexport * as "foo-bar" from "./dep.js";\nexport * as second from "./dep.js";\n',
		);
	});

	it('recognises the namespace helper under the alias Rolldown gives it when the module has an export of that name', () => {
		const dep = chunk(
			'dep.js',
			'import { __exportAll as __exportAll$1 } from "./runtime.js";\nvar dep_exports = /* @__PURE__ */ __exportAll$1({ a: () => "a" });\nconst a = "a";\nexport { a, dep_exports };\n',
		);
		const user = chunk(
			'user.js',
			'import { dep_exports } from "./dep.js";\nexport const keys = Object.keys(dep_exports);\n',
		);

		normalizePreservedModuleOutput([dep, user], new Set());

		expect(dep.code).toBe('const a = "a";\nexport { a };\n');
		expect(user.code).toContain('import * as dep_exports from "./dep.js";');
	});

	it('leaves a module alone whose file exports an init function, which a native namespace would list as a key', () => {
		const code =
			'import { __esmMin, __exportAll } from "./runtime.js";\nvar dep_exports = /* @__PURE__ */ __exportAll({ a: () => "a" });\nvar a;\nvar init_dep = __esmMin(() => {\n\ta = "a";\n});\nexport { a, dep_exports, init_dep };\n';
		const dep = chunk('dep.js', code);

		normalizePreservedModuleOutput([dep], new Set());

		expect(dep.code).toBe(code);
	});

	it('leaves a file alone when the module also reads its own namespace', () => {
		const code = [
			'import { __exportAll } from "./runtime.js";',
			'var self_exports = /* @__PURE__ */ __exportAll({ a: () => "a" });',
			'const a = "a";',
			'const keys = Object.keys(self_exports);',
			'export { a, keys, self_exports };',
			'',
		].join('\n');
		const self = chunk('self.js', code);

		normalizePreservedModuleOutput([self], new Set());

		expect(self.code).toBe(code);
	});

	it('stops a CommonJS module that is not an entry from running when its file loads, and exports its require function', () => {
		const target = chunk(
			'target.js',
			'var require_target = __commonJSMin((exports, module) => {\n\tmodule.exports = 1;\n});\nexport default require_target();\n',
		);

		normalizePreservedModuleOutput([target], new Set());

		expect(target.code).not.toContain('export default');
		expect(target.code).toContain('export { require_target };');
	});

	it('keeps the line that runs a CommonJS module that is an entry', () => {
		const code =
			'var require_target = __commonJSMin(() => {});\nexport default require_target();\nexport { require_target };\n';
		const target = chunk('target.js', code);

		normalizePreservedModuleOutput([target], new Set(['/app/target.js']));

		expect(target.code).toBe(code);
	});

	it('sends a dynamic import of a CommonJS module to a sibling file that runs it, once per module', () => {
		const target = chunk(
			'target.js',
			'var require_target = __commonJSMin(() => {});\nexport default require_target();\nexport { require_target };\n',
		);
		const user = chunk(
			'user.js',
			'const lazy = () => import("./target.js").then((m) => m.default);\nconst again = () => import("./target.js");\n',
			{ dynamicImports: ['target.js'] },
		);

		const assets = normalizePreservedModuleOutput([target, user], new Set());

		expect(user.code).not.toContain('"./target.js"');
		expect(user.code.match(/"\.\/target~dyn\.js"/gu)).toHaveLength(2);
		expect(assets).toEqual([
			{
				fileName: 'target~dyn.js',
				source: 'import { require_target } from "./target.js";\nexport default require_target();\n',
			},
		]);
	});
});
