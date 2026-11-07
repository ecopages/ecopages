import { describe, expect, test, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';

const loaded = vi.hoisted(() => ({ count: 0 }));

vi.mock('lightningcss', async (importOriginal) => {
	loaded.count += 1;
	return importOriginal();
});

describe('Lightning CSS loading', () => {
	test('the native binding loads on the first stylesheet, never while the config is finalized', async () => {
		const { LightningCssProcessorPlugin } = await import('../plugin');
		const rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-lazy-test-')));
		try {
			const plugin = new LightningCssProcessorPlugin({ options: { targets: ['chrome 80'] } });
			const config = await finalizeEcoPagesConfig({ rootDir, processors: [plugin] });
			plugin.setContext(config);
			await plugin.setup();
			expect(loaded.count).toBe(0);

			await plugin.transformStylesheet('.a { color: red; }', path.join(rootDir, 'a.css'));
			expect(loaded.count).toBe(1);
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
