import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { installBuildRuntime } from '../build/runtime/build-runtime.ts';
import { DevTransformVendorRegistry } from '../dev/transform-server/dev-transform-vendor-registry.ts';
import { ProjectWatcher } from './project-watcher.ts';
import { resolveWorkspacePackageWatchRoots } from './workspace-package-watch-roots.ts';
import { createMockBridge, createMockHmrManager } from './project-watcher.test-helpers.ts';
import { RESOLVED_ASSETS_VENDORS_DIR } from '../config/constants.ts';

const roots: string[] = [];
const watchers: ProjectWatcher[] = [];

afterEach(async () => {
	await Promise.all(watchers.splice(0).map((watcher) => watcher.close()));
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	vi.restoreAllMocks();
});

test.each(['package', 'dependency', 'add', 'unlink'])(
	'a linked package %s event requests a restart and serves current browser code',
	async (edited) => {
		const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'eco-workspace-watch-')));
		roots.push(root);
		const rootDir = path.join(root, 'app');
		const packageDir = path.join(root, 'ui');
		const dependencyDir = path.join(root, 'ui-dep');
		mkdirSync(path.join(rootDir, 'node_modules', '@acme'), { recursive: true });
		mkdirSync(path.join(packageDir, 'src'), { recursive: true });
		mkdirSync(path.join(packageDir, 'node_modules'), { recursive: true });
		mkdirSync(dependencyDir);
		writeFileSync(
			path.join(dependencyDir, 'package.json'),
			JSON.stringify({ name: 'ui-dep', version: '1.0.0', type: 'module', module: 'index.js' }),
		);
		const dependencySource = path.join(dependencyDir, 'index.js');
		writeFileSync(dependencySource, "export const dep = 'dependency-before';");
		symlinkSync(dependencyDir, path.join(packageDir, 'node_modules/ui-dep'), 'dir');
		symlinkSync(dependencyDir, path.join(rootDir, 'node_modules/ui-dep'), 'dir');
		writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ dependencies: { '@acme/ui': 'workspace:*', 'ui-dep': 'workspace:*' } }),
		);
		writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({ name: '@acme/ui', version: '1.0.0', type: 'module', module: 'src/index.ts' }),
		);
		writeFileSync(
			path.join(packageDir, 'src/index.ts'),
			"export { label } from './button.ts'; export { dep } from 'ui-dep';",
		);
		const button = path.join(packageDir, 'src/button.ts');
		writeFileSync(button, "export const label = 'before-edit';");
		const extra = path.join(packageDir, 'src/extra.ts');
		if (edited === 'unlink') writeFileSync(extra, 'export const extra = 1;');
		symlinkSync(packageDir, path.join(rootDir, 'node_modules/@acme/ui'), 'dir');
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		installBuildRuntime(config);
		const registry = () =>
			new DevTransformVendorRegistry({ appConfig: config, getRuntimeSpecifierMap: () => new Map() });
		const running = registry();
		const oldUrl = await running.resolveVendorUrl('@acme/ui');
		const oldResponse = running.tryHandleVendorRequest(oldUrl);
		expect(await oldResponse?.text()).toContain('before-edit');
		const oldEtag = oldResponse?.headers.get('ETag');
		const vendorOutput = path.join(
			config.absolutePaths.distDir,
			RESOLVED_ASSETS_VENDORS_DIR,
			path.basename(oldUrl),
		);
		expect(existsSync(vendorOutput)).toBe(true);
		const restart = vi.fn(async () => {
			expect(existsSync(vendorOutput)).toBe(false);
		});
		const hmrManager = createMockHmrManager();
		const watcher = new ProjectWatcher({
			config,
			hmrManager,
			bridge: createMockBridge(),
			refreshRouterRoutesCallback: async () => {},
			onRestartRequest: restart,
			changeDebounceMs: 0,
		});
		watchers.push(watcher);
		const subscription = await watcher.createWatcherSubscription();
		await new Promise<void>((resolve) => subscription.once('ready', resolve));
		expect(resolveWorkspacePackageWatchRoots(config.rootDir)).toContain(packageDir);
		await vi.waitFor(() => expect(subscription.getWatched()[path.join(packageDir, 'src')]).toContain('button.ts'), {
			timeout: 3000,
		});
		const changedPath = edited === 'package' ? button : edited === 'dependency' ? dependencySource : extra;
		if (edited === 'unlink') rmSync(changedPath);
		else
			writeFileSync(
				changedPath,
				edited === 'package' ? "export const label = 'after-edit';" : "export const dep = 'dependency-after';",
			);
		await vi.waitFor(() => expect(restart).toHaveBeenCalledWith(changedPath), { timeout: 3000 });
		expect(hmrManager.handleFileChange).not.toHaveBeenCalled();
		const restarted = registry();
		const newUrl = await restarted.resolveVendorUrl('@acme/ui');
		if (edited === 'package') expect(newUrl).not.toBe(oldUrl);
		const newResponse = restarted.tryHandleVendorRequest(newUrl, edited === 'dependency' ? oldEtag : undefined);
		expect(newResponse?.status).toBe(200);
		expect(await newResponse?.text()).toContain(
			edited === 'package' ? 'after-edit' : edited === 'dependency' ? 'dependency-after' : 'before-edit',
		);
	},
);

test('ignores installed and hidden linked-package files while app source retains HMR', async () => {
	const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'eco-workspace-watch-ignore-')));
	roots.push(root);
	const rootDir = path.join(root, 'app');
	const linked = path.join(root, 'ui');
	const appSource = path.join(rootDir, 'src', 'pages', 'index.ts');
	const ignoredPaths = [
		path.join(linked, '.cache', 'output.js'),
		path.join(linked, 'src', '.generated.ts'),
		path.join(linked, 'node_modules', 'dep', 'index.js'),
		path.join(rootDir, 'node_modules', 'installed', 'index.js'),
	];
	for (const file of [...ignoredPaths, appSource, path.join(linked, 'src', 'index.ts')]) {
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, 'export const value = 1;');
	}
	writeFileSync(
		path.join(rootDir, 'package.json'),
		JSON.stringify({ dependencies: { ui: 'workspace:*', installed: '1' } }),
	);
	writeFileSync(path.join(linked, 'package.json'), JSON.stringify({ name: 'ui', module: 'src/index.ts' }));
	writeFileSync(path.join(rootDir, 'node_modules', 'installed', 'package.json'), '{}');
	symlinkSync(linked, path.join(rootDir, 'node_modules', 'ui'), 'dir');
	const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
	const restart = vi.fn(async () => {});
	const hmrManager = createMockHmrManager();
	const bridge = createMockBridge();
	const watcher = new ProjectWatcher({
		config,
		hmrManager,
		bridge,
		refreshRouterRoutesCallback: async () => {},
		onRestartRequest: restart,
		changeDebounceMs: 0,
	});
	watchers.push(watcher);
	const subscription = await watcher.createWatcherSubscription();
	await new Promise<void>((resolve) => subscription.once('ready', resolve));
	await vi.waitFor(
		() => {
			expect(subscription.getWatched()[path.dirname(appSource)]).toContain(path.basename(appSource));
			expect(subscription.getWatched()[path.join(linked, 'src')]).toContain('index.ts');
		},
		{ timeout: 3000 },
	);
	await new Promise((resolve) => setTimeout(resolve, 150));
	restart.mockClear();
	vi.mocked(hmrManager.handleFileChange).mockClear();
	vi.mocked(bridge.reload).mockClear();
	for (const file of ignoredPaths) writeFileSync(file, 'export const value = 2;');
	writeFileSync(appSource, 'export const value = 2;');
	await vi.waitFor(() => expect(bridge.reload).toHaveBeenCalled(), {
		timeout: 3000,
	});
	expect(restart).not.toHaveBeenCalled();
	expect(hmrManager.handleFileChange).not.toHaveBeenCalled();
	for (const file of ignoredPaths)
		expect(hmrManager.handleFileChange).not.toHaveBeenCalledWith(file, expect.anything());
});
