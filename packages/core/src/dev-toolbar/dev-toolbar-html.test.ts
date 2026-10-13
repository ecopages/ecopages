import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeHmrManager } from '../adapters/node/node-hmr-manager.ts';
import { installBuildRuntime } from '../build/runtime/build-runtime.ts';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { DEV_TOOLBAR_RUNTIME_IMPORT } from './dev-toolbar-runtime-paths.ts';

const toolbarPackageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dev-toolbar');
const HMR_RUNTIME_IMPORT = "import '/_hmr_runtime.js'";
const tempRoots: string[] = [];
const managers: NodeHmrManager[] = [];

afterEach(() => {
	for (const manager of managers.splice(0)) {
		manager.stop();
	}
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

/** Creates a manager for an app whose `node_modules` holds the workspace Dev Toolbar package, or none. */
async function createManager(options: { toolbarPackage: string; installToolbar: boolean }): Promise<NodeHmrManager> {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-dev-client-runtimes-'));
	tempRoots.push(rootDir);
	if (options.installToolbar) {
		const scopeDir = path.join(rootDir, 'node_modules', '@ecopages');
		fs.mkdirSync(scopeDir, { recursive: true });
		fs.symlinkSync(toolbarPackageDir, path.join(scopeDir, 'dev-toolbar'), 'dir');
	}

	const appConfig = await finalizeEcoPagesConfig({ rootDir, devToolbar: { package: options.toolbarPackage } });
	installBuildRuntime(appConfig);
	const manager = new NodeHmrManager({
		appConfig,
		bridge: { subscriberCount: 0, broadcast: () => {} } as never,
	});
	managers.push(manager);
	return manager;
}

async function injectIntoHtml(manager: NodeHmrManager): Promise<string> {
	const response = await manager.injectDevClientRuntimes(
		new Response('<html><body></body></html>', { headers: { 'Content-Type': 'text/html' } }),
	);
	return await response.text();
}

describe('dev client runtimes', () => {
	it('loads the HMR runtime and then the Dev Toolbar runtime at the end of a page', async () => {
		const manager = await createManager({ toolbarPackage: '@ecopages/dev-toolbar', installToolbar: true });
		manager.setEnabled(true);
		expect(await manager.ensureRuntimeReady()).toBe(true);

		const html = await injectIntoHtml(manager);

		expect(html).toContain(
			`<script type="module">${HMR_RUNTIME_IMPORT};</script><script type="module">${DEV_TOOLBAR_RUNTIME_IMPORT};</script></html>`,
		);
		expect(manager.tryHandleAssetRequest(new Request('http://localhost/_dev_toolbar.js'))?.status).toBe(200);
	});

	it('does not load the same runtime twice', async () => {
		const manager = await createManager({ toolbarPackage: '@ecopages/dev-toolbar', installToolbar: true });
		manager.setEnabled(true);
		await manager.ensureRuntimeReady();

		const once = await manager.injectDevClientRuntimes(new Response(await injectIntoHtml(manager)));

		expect((await once.text()).split(DEV_TOOLBAR_RUNTIME_IMPORT)).toHaveLength(2);
	});

	it('keeps the HMR runtime and leaves the Dev Toolbar runtime out when its package is not installed', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const manager = await createManager({ toolbarPackage: '@ecopages/missing-dev-toolbar', installToolbar: false });
		manager.setEnabled(true);
		await manager.ensureRuntimeReady();

		const html = await injectIntoHtml(manager);

		expect(html).toContain(HMR_RUNTIME_IMPORT);
		expect(html).not.toContain(DEV_TOOLBAR_RUNTIME_IMPORT);
		expect(manager.tryHandleAssetRequest(new Request('http://localhost/_dev_toolbar.js'))).toBeNull();
	});

	it('leaves a page alone while HMR is disabled', async () => {
		const manager = await createManager({ toolbarPackage: '@ecopages/dev-toolbar', installToolbar: true });

		expect(await injectIntoHtml(manager)).toBe('<html><body></body></html>');
	});
});
