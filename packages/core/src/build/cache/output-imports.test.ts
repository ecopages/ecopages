import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { collectReachableLocalImports, readLocalImports } from './output-imports.ts';

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

		assert.deepEqual(readLocalImports(pagePath).sort(), [srcPath].sort());
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

	it('does not loop on circular local imports', () => {
		const tempDir = createTempDir();
		const aPath = path.join(tempDir, 'a.js');
		const bPath = path.join(tempDir, 'b.js');

		writeFileSync(aPath, `import './b.js';\nexport const a = 1;\n`);
		writeFileSync(bPath, `import './a.js';\nexport const b = 1;\n`);

		assert.deepEqual(collectReachableLocalImports(aPath), [bPath]);
	});
});
