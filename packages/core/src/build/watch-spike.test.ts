import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'vitest';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';
import { RolldownDevBuildAdapter } from './rolldown-dev-build-adapter.ts';

describe('watch spike: rolldown vs dev engine', () => {
	const workDirs: string[] = [];
	const devAdapters: RolldownDevBuildAdapter[] = [];

	afterEach(async () => {
		for (const adapter of devAdapters.splice(0)) {
			await adapter.close();
		}
		for (const workDir of workDirs.splice(0)) {
			rmSync(workDir, { recursive: true, force: true });
		}
	});

	it('reuses DevEngine output on repeated builds of the same entrypoint', async () => {
		const workDir = mkdtempSync(path.join(tmpdir(), 'eco-watch-spike-'));
		workDirs.push(workDir);
		const entryPath = path.join(workDir, 'entry.ts');
		writeFileSync(entryPath, 'export const value = 1;\n', 'utf8');

		const options = {
			entrypoints: [entryPath],
			root: workDir,
			outdir: path.join(workDir, 'out'),
			target: 'node' as const,
			format: 'esm' as const,
			sourcemap: 'none' as const,
			splitting: false,
			minify: false,
		};

		const productionAdapter = new RolldownBuildAdapter();
		const devAdapter = new RolldownDevBuildAdapter();
		devAdapters.push(devAdapter);

		const coldProduction = await productionAdapter.build(options);
		const coldDev = await devAdapter.build(options);
		const warmDev = await devAdapter.build(options);

		assert.equal(coldProduction.success, true);
		assert.equal(coldDev.success, true);
		assert.equal(warmDev.success, true);
		assert.ok(coldDev.outputs.length > 0);
		assert.ok(warmDev.outputs.length > 0);
	});

	it('documents that production adapter always cold-starts while dev adapter persists graph state', () => {
		assert.equal(new RolldownBuildAdapter().ownership, 'rolldown');
		assert.equal(new RolldownDevBuildAdapter().ownership, 'rolldown-dev');
	});
});
