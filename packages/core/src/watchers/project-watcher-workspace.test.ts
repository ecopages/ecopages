import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import { DevTransformVendorRegistry } from '../dev/transform-server/dev-transform-vendor-registry.ts';
import { ProjectWatcher } from './project-watcher.ts';
import { resolveWorkspacePackageWatchRoots } from './workspace-package-watch-roots.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { createMockBridge, createMockHmrManager, installFakeFileSystemWatch } from './project-watcher.test-helpers.ts';

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
		writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ dependencies: { '@acme/ui': 'workspace:*' } }),
		);
		writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({
				name: '@acme/ui',
				version: '1.0.0',
				type: 'module',
				module: 'src/index.ts',
				dependencies: { 'ui-dep': 'workspace:*' },
			}),
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
		const registry = () => new DevTransformVendorRegistry({ appConfig: config });
		const running = registry();
		const oldUrl = await running.resolveVendorUrl('@acme/ui');
		const oldResponse = await running.tryHandleVendorRequest(oldUrl);
		const oldCode = (await oldResponse?.text()) ?? '';
		expect(oldCode).toContain('before-edit');
		const dependencyUrl = /from\s*["'](\/assets\/vendors\/ui-dep[^"']+)["']/.exec(oldCode)?.[1];
		assert.ok(dependencyUrl);
		const oldDependencyEtag = (await running.tryHandleVendorRequest(dependencyUrl))?.headers.get('ETag');
		const restart = vi.fn(async () => {});
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
		const changedPath = edited === 'package' ? button : edited === 'dependency' ? dependencySource : extra;
		requireAppRuntime(config).buildInputIndex.recordWatchPath(changedPath);
		await watcher.createWatcherSubscription();
		expect(resolveWorkspacePackageWatchRoots(config.rootDir)).toContain(packageDir);
		if (edited === 'unlink') rmSync(changedPath);
		else
			writeFileSync(
				changedPath,
				edited === 'package' ? "export const label = 'after-edit';" : "export const dep = 'dependency-after';",
			);
		await vi.waitFor(() => expect(restart).toHaveBeenCalledWith(changedPath), { timeout: 3000 });
		expect(hmrManager.handleFileChanges).not.toHaveBeenCalled();
		const restarted = registry();
		const newUrl = await restarted.resolveVendorUrl('@acme/ui');
		expect(newUrl).toBe(oldUrl);
		const newResponse =
			edited === 'dependency'
				? await restarted.tryHandleVendorRequest(dependencyUrl, oldDependencyEtag)
				: await restarted.tryHandleVendorRequest(newUrl);
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
	const restart = vi.fn(async (_filePath: string) => {});
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
	requireAppRuntime(config).buildInputIndex.recordWatchPath(path.join(linked, 'src', 'index.ts'));
	await watcher.createWatcherSubscription();
	const drained = path.join(linked, 'src', 'drained.ts');
	writeFileSync(drained, 'export const value = 1;');
	await vi.waitFor(() => expect(restart).toHaveBeenCalledWith(drained), { timeout: 3000, interval: 1 });
	restart.mockClear();
	const batchHandler = hmrManager.handleFileChanges;
	if (!batchHandler) throw new Error('Mock HMR manager is missing its batch handler');
	vi.mocked(batchHandler).mockClear();
	vi.mocked(bridge.reload).mockClear();
	for (const file of ignoredPaths) writeFileSync(file, 'export const value = 2;');
	writeFileSync(appSource, 'export const value = 2;');
	await vi.waitFor(() => expect(hmrManager.handleFileChanges).toHaveBeenCalledOnce(), {
		timeout: 3000,
		interval: 1,
	});
	expect(restart.mock.calls.map(([file]) => file).filter((file) => file !== drained)).toEqual([]);
	expect(hmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(appSource)], { broadcast: true });
	expect(bridge.reload).not.toHaveBeenCalled();
	for (const file of ignoredPaths)
		expect(hmrManager.handleFileChanges).not.toHaveBeenCalledWith([file], expect.anything());
});

test('activates a linked package root when a build input is recorded after startup', async () => {
	const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'eco-workspace-watch-late-')));
	roots.push(root);
	const rootDir = path.join(root, 'app');
	const packageDir = path.join(root, 'ui');
	const packageSource = path.join(packageDir, 'src/index.ts');
	const packageDoc = path.join(packageDir, 'README.md');
	mkdirSync(path.join(rootDir, 'node_modules'), { recursive: true });
	mkdirSync(path.dirname(packageSource), { recursive: true });
	writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ dependencies: { ui: 'workspace:*' } }));
	writeFileSync(packageSource, 'export const value = 1;');
	writeFileSync(packageDoc, '# UI');
	writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'ui', module: 'src/index.ts' }));
	symlinkSync(packageDir, path.join(rootDir, 'node_modules/ui'), 'dir');
	const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
	config.additionalWatchPaths = ['../**/*.md'];
	const fake = installFakeFileSystemWatch();
	const restart = vi.fn(async (_filePath: string) => {});
	const watcher = new ProjectWatcher({
		config,
		hmrManager: createMockHmrManager(),
		bridge: createMockBridge(),
		refreshRouterRoutesCallback: async () => {},
		onRestartRequest: restart,
		changeDebounceMs: 0,
	});
	watchers.push(watcher);
	await watcher.createWatcherSubscription();

	expect(fake.watch.mock.calls[0]?.[0]).not.toContain(packageDir);
	const ignored = fake.watch.mock.calls[0]?.[1].ignored;
	expect(ignored?.(packageSource, { isFile: true, isDirectory: false, isSymbolicLink: false, size: 1 })).toBe(true);
	expect(ignored?.(packageDoc, { isFile: true, isDirectory: false, isSymbolicLink: false, size: 1 })).toBe(false);
	fake.handle.add.mockRejectedValueOnce(new Error('temporary watch failure'));
	requireAppRuntime(config).buildInputIndex.recordWatchPath(packageSource);
	expect(ignored?.(packageSource, { isFile: true, isDirectory: false, isSymbolicLink: false, size: 1 })).toBe(false);
	expect(fake.handle.add).toHaveBeenCalledWith([packageDir]);
	await vi.waitFor(() =>
		expect(ignored?.(packageSource, { isFile: true, isDirectory: false, isSymbolicLink: false, size: 1 })).toBe(
			true,
		),
	);
	requireAppRuntime(config).buildInputIndex.recordWatchPath(path.join(packageDir, 'src/second.ts'));
	await vi.waitFor(() => expect(fake.handle.paths).toContain(packageDir));
	expect(fake.handle.add).toHaveBeenCalledTimes(2);
	requireAppRuntime(config).buildInputIndex.recordWatchPath(path.join(packageDir, 'src/third.ts'));
	expect(fake.handle.add).toHaveBeenCalledTimes(2);
	await fake.emit('change', packageSource);
	expect(restart).toHaveBeenCalledWith(packageSource);
});
