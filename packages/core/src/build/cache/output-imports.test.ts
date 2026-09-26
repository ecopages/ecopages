import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { collectLocalImports, collectReachableLocalImports } from './output-imports.ts';

describe('collectLocalImports', () => {
	const modulePath = '/out/pages/page.mjs';

	it('lists relative, absolute and file: specifiers from every import form', () => {
		const code = [
			`import './side-effect.js';`,
			`import value from '../shared/value.js';`,
			`export { chunk } from './chunk.js';`,
			`export * from './star.js';`,
			`const lazy = () => import('./lazy.js?v=1#top');`,
			'const template = () => import(`./template.js`);',
			`import posts from '/app/.eco/.server-collections/posts.mjs';`,
			`import linked from 'file:///app/linked.mjs';`,
		].join('\n');

		assert.deepEqual(
			collectLocalImports(code, modulePath).sort(),
			[
				'/out/pages/side-effect.js',
				'/out/shared/value.js',
				'/out/pages/chunk.js',
				'/out/pages/star.js',
				'/out/pages/lazy.js',
				'/out/pages/template.js',
				'/app/.eco/.server-collections/posts.mjs',
				'/app/linked.mjs',
			].sort(),
		);
	});

	it('ignores packages, builtins and computed dynamic imports', () => {
		const code = [
			`import react from 'react';`,
			`import { readFile } from 'node:fs';`,
			`const builtin = () => import('node:path');`,
			'const computed = (name) => import(`./${name}.js`);',
			`const variable = (name) => import(name);`,
		].join('\n');

		assert.deepEqual(collectLocalImports(code, modulePath), []);
	});

	it('lists a file once when several forms import it', () => {
		const code = [`import './chunk.js';`, `export { a } from './chunk.js';`, `import('./chunk.js');`].join('\n');

		assert.deepEqual(collectLocalImports(code, modulePath), ['/out/pages/chunk.js']);
	});
});

describe('collectReachableLocalImports', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) {
			rmSync(tempDir, { force: true, recursive: true });
		}
	});

	function createTempDir(): string {
		const tempDir = mkdtempSync(path.join(tmpdir(), 'ecopages-output-imports-'));
		tempDirs.push(tempDir);
		return tempDir;
	}

	it('includes shared chunks reached through another local import', () => {
		const tempDir = createTempDir();
		const pagePath = path.join(tempDir, 'page-CLtpMCiA.js');
		const srcPath = path.join(tempDir, 'src-CLtpMCiA.js');
		const commonPath = path.join(tempDir, 'common-C70_Ss5a.js');

		writeFileSync(pagePath, `import './src-CLtpMCiA.js';\nexport default {};\n`);
		writeFileSync(srcPath, `import './common-C70_Ss5a.js';\nexport const page = 1;\n`);
		writeFileSync(commonPath, `export const shared = 1;\n`);

		assert.deepEqual(collectLocalImports(`import './src-CLtpMCiA.js';`, pagePath), [srcPath]);
		assert.deepEqual(collectReachableLocalImports(pagePath).sort(), [srcPath, commonPath].sort());
	});

	it('does not list the starting module', () => {
		const tempDir = createTempDir();
		const pagePath = path.join(tempDir, 'page.js');
		writeFileSync(pagePath, `export default {};\n`);

		assert.deepEqual(collectReachableLocalImports(pagePath), []);
	});

	it('still lists a missing nested import so cache reuse can fail', () => {
		const tempDir = createTempDir();
		const pagePath = path.join(tempDir, 'page.js');
		const srcPath = path.join(tempDir, 'src.js');
		const commonPath = path.join(tempDir, 'common.js');

		writeFileSync(pagePath, `import './src.js';\n`);
		writeFileSync(srcPath, `import './common.js';\n`);

		assert.deepEqual(collectReachableLocalImports(pagePath).sort(), [srcPath, commonPath].sort());
	});

	it('reads a shared chunk once when outputs share a directImportsCache', () => {
		const tempDir = createTempDir();
		const aPath = path.join(tempDir, 'a.js');
		const bPath = path.join(tempDir, 'b.js');
		const commonPath = path.join(tempDir, 'common.js');

		writeFileSync(aPath, `import './common.js';\n`);
		writeFileSync(bPath, `import './common.js';\n`);
		writeFileSync(commonPath, `export const shared = 1;\n`);

		const reads: string[] = [];
		const fileAccess = {
			exists: existsSync,
			readFile: (filePath: string) => {
				reads.push(filePath);
				return readFileSync(filePath, 'utf8');
			},
		};
		const directImportsCache = new Map<string, string[]>();

		assert.deepEqual(collectReachableLocalImports(aPath, { fileAccess, directImportsCache }), [commonPath]);
		assert.deepEqual(collectReachableLocalImports(bPath, { fileAccess, directImportsCache }), [commonPath]);
		assert.deepEqual(reads.sort(), [aPath, bPath, commonPath].sort());
	});

	it('does not loop on circular local imports', () => {
		const tempDir = createTempDir();
		const aPath = path.join(tempDir, 'a.js');
		const bPath = path.join(tempDir, 'b.js');

		writeFileSync(aPath, `import './b.js';\nexport const a = 1;\n`);
		writeFileSync(bPath, `import './a.js';\nexport const b = 1;\n`);

		assert.deepEqual(collectReachableLocalImports(aPath), [bPath]);
	});
});
