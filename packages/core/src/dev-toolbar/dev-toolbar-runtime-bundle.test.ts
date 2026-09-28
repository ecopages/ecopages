import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { installBuildRuntime } from '../build/runtime/build-runtime.ts';
import { ConfigBuilder } from '../config/config-builder.ts';
import { BrowserBundleService } from '../services/assets/browser-bundle.service.ts';
import { DevToolbarHost } from './dev-toolbar-host.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const kitchenSinkRoot = path.join(repoRoot, 'playground', 'kitchen-sink');
const workDirs: string[] = [];

afterEach(() => {
	for (const dir of workDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe('dev toolbar runtime bundle', () => {
	it('bundles without leaving bare @ecopages/core imports', async () => {
		const appConfig = await new ConfigBuilder()
			.setRootDir(kitchenSinkRoot)
			.setDevToolbar({ package: '@ecopages/dev-toolbar' })
			.build();

		installBuildRuntime(appConfig);
		const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-toolbar-runtime-'));
		workDirs.push(workDir);

		const ready = await DevToolbarHost.forApp(appConfig, { watch: true }).bundleClientRuntime({
			browserBundleService: new BrowserBundleService(appConfig),
			workDir,
			onFailure: (error) => {
				throw error instanceof Error ? error : new Error(String(error));
			},
		});

		expect(ready).toBe(true);

		const bundle = fs.readFileSync(path.join(workDir, '_dev_toolbar.js'), 'utf8');
		expect(bundle).not.toMatch(/from ['"]@ecopages\/core/);
		expect(bundle).toContain('__ECO_DEV_MANIFEST__');
	});
});
