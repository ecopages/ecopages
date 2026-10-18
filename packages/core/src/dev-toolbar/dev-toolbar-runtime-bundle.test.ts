import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installBuildQueue } from '../build/runtime/build-queue.ts';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { bundleDevClientRuntime } from '../hmr/dev-client-runtime.ts';
import { BrowserBundleService } from '../assets/browser-bundle.service.ts';
import { createDevToolbarClientRuntime } from './dev-toolbar-runtime.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const kitchenSinkRoot = path.join(repoRoot, 'playground', 'kitchen-sink');
const workDirs: string[] = [];

afterEach(() => {
	for (const dir of workDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

describe('dev toolbar runtime bundle', () => {
	it('bundles without leaving bare @ecopages/core imports', async () => {
		const appConfig = await finalizeEcoPagesConfig({
			rootDir: kitchenSinkRoot,
			devToolbar: { package: '@ecopages/dev-toolbar' },
		});

		installBuildQueue(appConfig);
		const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-toolbar-runtime-'));
		workDirs.push(workDir);

		const runtime = {
			...createDevToolbarClientRuntime(appConfig),
			workDir,
			onFailure: (error: unknown) => {
				throw error instanceof Error ? error : new Error(String(error));
			},
		};
		const ready = await bundleDevClientRuntime(runtime, new BrowserBundleService(appConfig));

		expect(ready).toBe(true);

		const bundle = fs.readFileSync(path.join(workDir, '_dev_toolbar.js'), 'utf8');
		expect(bundle).not.toMatch(/from ['"]@ecopages\/core/);
		expect(bundle).toContain('__ECO_DEV_MANIFEST__');
	});

	it('logs a package that is not installed and reports the runtime as not built', async () => {
		const appConfig = await finalizeEcoPagesConfig({
			rootDir: kitchenSinkRoot,
			devToolbar: { package: '@ecopages/missing-dev-toolbar' },
		});
		installBuildQueue(appConfig);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const ready = await bundleDevClientRuntime(
			createDevToolbarClientRuntime(appConfig),
			new BrowserBundleService(appConfig),
		);

		expect(ready).toBe(false);
		expect(errorSpy.mock.calls.flat().join(' ')).toContain('Could not bundle the Dev Toolbar runtime');
	});
});
