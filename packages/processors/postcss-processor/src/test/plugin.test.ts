import { describe, expect, test, afterEach, beforeEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import postcss from 'postcss';
import postcssNested from 'postcss-nested';
import { PostCssProcessorPlugin } from '../plugin';
import type { IClientBridge } from '@ecopages/core';
import { finalizeEcoPagesConfig } from '@ecopages/core/internal/finalize-config';

let tmpDir: string;
let srcDir: string;
let distDir: string;

function hashedCssContents(): string[] {
	const assetsDir = path.join(distDir, 'assets');
	if (!fs.existsSync(assetsDir)) {
		return [];
	}

	return fs
		.readdirSync(assetsDir)
		.filter((filename) => /^[a-f0-9]{16}\.css$/.test(filename))
		.map((filename) => fs.readFileSync(path.join(assetsDir, filename), 'utf-8'));
}

describe('PostCssProcessorPlugin HMR', () => {
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postcss-plugin-test-'));
		srcDir = path.join(tmpDir, 'src');
		distDir = path.join(tmpDir, 'dist');
		fs.mkdirSync(srcDir, { recursive: true });
		fs.mkdirSync(distDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test('handleCssChange should apply transformInput', async () => {
		const cssFile = path.join(srcDir, 'style.css');
		fs.writeFileSync(cssFile, '.foo { color: red; }');

		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /\.css$/,
				transformInput: async (content) => {
					return `/* prefix */\n${content}`;
				},
			},
		});

		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});

		plugin.setContext(config);

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as IClientBridge;

		const bridgeSpy = vi.spyOn(Bridge, 'cssUpdate');

		const watchConfig = plugin.getWatchConfig();
		if (watchConfig && watchConfig.onChanges) {
			await watchConfig.onChanges({ created: [], changed: [cssFile], deleted: [], bridge: Bridge });
		} else {
			throw new Error('Plugin does not have watch handler');
		}

		const outputFile = path.join(distDir, 'assets', 'style.css');
		expect(fs.existsSync(outputFile)).toBe(true);

		const outputContent = fs.readFileSync(outputFile, 'utf-8');
		expect(outputContent).toContain('/* prefix */');
		expect(outputContent).toContain('.foo { color: red; }');

		expect(bridgeSpy).toHaveBeenCalled();
		expect(bridgeSpy).toHaveBeenCalledWith(cssFile);
	});

	test('dependency changes should rebuild tracked CSS with fresh plugin instances', async () => {
		const cssFile = path.join(srcDir, 'style.css');
		const dependencyFile = path.join(srcDir, 'component.tsx');
		fs.writeFileSync(cssFile, '.foo { color: red; }');
		fs.writeFileSync(dependencyFile, 'export const Component = () => <div className="text-red-500" />;');

		let activeColor = 'red';
		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /\.css$/,
				pluginFactories: {
					'test-color-plugin': () => {
						const colorAtCreation = activeColor;

						return {
							postcssPlugin: 'test-color-plugin',
							Declaration(decl) {
								if (decl.prop === 'color') {
									decl.value = colorAtCreation;
								}
							},
						} as postcss.AcceptedPlugin;
					},
				},
			},
		});

		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});

		plugin.setContext(config);
		await plugin.setup();

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as IClientBridge;

		const bridgeSpy = vi.spyOn(Bridge, 'cssUpdate');
		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChanges) {
			throw new Error('Plugin does not have watch handler');
		}

		activeColor = 'blue';
		await watchConfig.onChanges({ created: [], changed: [dependencyFile], deleted: [], bridge: Bridge });

		const outputFile = path.join(distDir, 'assets', 'style.css');
		const outputContent = fs.readFileSync(outputFile, 'utf-8');

		expect(outputContent).toContain('color: blue');
		expect(bridgeSpy).toHaveBeenCalledWith(cssFile);
	});

	test('non-CSS dependency changes should rebuild each CSS entry once', async () => {
		const stylesDir = path.join(srcDir, 'dependency-entry-test');
		fs.mkdirSync(path.join(stylesDir, 'partials'), { recursive: true });

		const entryFile = path.join(stylesDir, 'tailwind.css');
		const themeFile = path.join(stylesDir, 'partials', 'theme.css');
		const proseFile = path.join(stylesDir, 'partials', 'prose.css');
		const dependencyFiles = Array.from({ length: 50 }, (_, index) =>
			path.join(srcDir, `entry-trigger-${index}.tsx`),
		);

		fs.writeFileSync(themeFile, '.theme { color: red; }');
		fs.writeFileSync(proseFile, '.prose { color: blue; }');
		fs.writeFileSync(
			entryFile,
			`@import './partials/theme.css';\n@import './partials/prose.css';\n.root { display: flex; color: red; }`,
		);
		for (const dependencyFile of dependencyFiles) {
			fs.writeFileSync(dependencyFile, 'export const Component = () => null;');
		}

		let activeColor = 'red';
		let pluginFactoryCalls = 0;

		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /dependency-entry-test\/.*\.css$/,
				dependencyEntryPaths: [entryFile],
				pluginFactories: {
					'test-color-plugin': () => {
						pluginFactoryCalls += 1;
						const colorAtCreation = activeColor;

						return {
							postcssPlugin: 'test-color-plugin',
							Declaration(decl) {
								if (decl.prop === 'color') {
									decl.value = colorAtCreation;
								}
							},
						} as postcss.AcceptedPlugin;
					},
				},
			},
		});

		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});

		plugin.setContext(config);
		await plugin.setup();

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as IClientBridge;

		const bridgeSpy = vi.spyOn(Bridge, 'cssUpdate');
		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChanges) {
			throw new Error('Plugin does not have watch handler');
		}

		activeColor = 'purple';
		const callsBeforeChange = pluginFactoryCalls;
		const processSpy = vi.spyOn(plugin, 'process');
		await watchConfig.onChanges({ created: [], changed: dependencyFiles, deleted: [], bridge: Bridge });

		expect(pluginFactoryCalls).toBe(callsBeforeChange + 1);
		expect(processSpy).toHaveBeenCalledTimes(1);
		expect(processSpy).toHaveBeenCalledWith(expect.any(String), entryFile);
		expect(bridgeSpy).toHaveBeenCalledTimes(1);
		expect(bridgeSpy).toHaveBeenCalledWith(entryFile);
	});

	test('created and deleted CSS in one batch rebuilds the remaining CSS entry once', async () => {
		const deletedCssFile = path.join(srcDir, 'batch-lifecycle-deleted.css');
		const createdCssFile = path.join(srcDir, 'batch-lifecycle-created.css');
		const remainingCssFile = path.join(srcDir, 'batch-lifecycle-remaining.css');
		fs.writeFileSync(deletedCssFile, '.deleted { color: red; }');
		fs.writeFileSync(remainingCssFile, '.remaining { color: green; }');

		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /batch-lifecycle.*\.css$/,
			},
		});
		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});
		plugin.setContext(config);
		await plugin.setup();

		fs.rmSync(deletedCssFile);
		fs.writeFileSync(createdCssFile, '.created { color: blue; }');

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as IClientBridge;
		const bridgeSpy = vi.spyOn(Bridge, 'cssUpdate');
		const processSpy = vi.spyOn(plugin, 'process');
		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChanges) {
			throw new Error('Plugin does not have watch handler');
		}

		await watchConfig.onChanges({
			created: [createdCssFile],
			changed: [],
			deleted: [deletedCssFile],
			bridge: Bridge,
		});

		expect(processSpy).toHaveBeenCalledTimes(2);
		expect(processSpy.mock.calls.map(([, filePath]) => filePath).sort()).toEqual(
			[createdCssFile, remainingCssFile].sort(),
		);
		expect(bridgeSpy).toHaveBeenCalledTimes(2);
		expect(bridgeSpy).toHaveBeenCalledWith(createdCssFile);
		expect(bridgeSpy).toHaveBeenCalledWith(remainingCssFile);
		expect(fs.readFileSync(path.join(distDir, 'assets', 'batch-lifecycle-created.css'), 'utf-8')).toContain(
			'.created',
		);
	});

	test('setup should use configured plugins initially and pluginFactories for rebuilds', async () => {
		const cssFile = path.join(srcDir, 'factory-precedence.css');
		const dependencyFile = path.join(srcDir, 'factory-precedence.tsx');
		fs.writeFileSync(cssFile, '.foo { color: red; }');
		fs.writeFileSync(dependencyFile, 'export const Component = () => <div className="text-red-500" />;');

		let refreshedColor = 'blue';
		const initialPlugin = {
			postcssPlugin: 'initial-color-plugin',
			Declaration(decl) {
				if (decl.prop === 'color') {
					decl.value = 'green';
				}
			},
		} as postcss.AcceptedPlugin;

		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /\.css$/,
				plugins: {
					'initial-color-plugin': initialPlugin,
				},
				pluginFactories: {
					'refreshed-color-plugin': () => {
						const colorAtCreation = refreshedColor;

						return {
							postcssPlugin: 'refreshed-color-plugin',
							Declaration(decl) {
								if (decl.prop === 'color') {
									decl.value = colorAtCreation;
								}
							},
						} as postcss.AcceptedPlugin;
					},
				},
			},
		});

		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});

		plugin.setContext(config);
		await plugin.setup();

		const initialResult = await plugin.process(fs.readFileSync(cssFile, 'utf-8'), cssFile);
		expect(initialResult).toContain('color: green');

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as IClientBridge;

		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChanges) {
			throw new Error('Plugin does not have watch handler');
		}

		refreshedColor = 'purple';
		await watchConfig.onChanges({ created: [], changed: [dependencyFile], deleted: [], bridge: Bridge });

		const outputFile = path.join(distDir, 'assets', 'factory-precedence.css');
		const outputContent = fs.readFileSync(outputFile, 'utf-8');

		expect(outputContent).toContain('color: purple');
	});

	test('process should apply transformInput for direct asset-pipeline calls', async () => {
		const cssFile = path.join(srcDir, 'direct-process.css');
		fs.writeFileSync(cssFile, '.foo { color: red; }');

		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /\.css$/,
				transformInput: async (content) => `/* direct */\n${content}`,
			},
		});

		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});

		plugin.setContext(config);
		await plugin.setup();

		const result = await plugin.process(fs.readFileSync(cssFile, 'utf-8'), cssFile);

		expect(result).toContain('/* direct */');
		expect(result).toContain('.foo { color: red; }');
	});

	test('imported CSS dependency change re-processes parent entry and broadcasts for parent path', async () => {
		const stylesDir = path.join(srcDir, 'styles_dep_test');
		const vendorDir = path.join(stylesDir, 'vendor');
		fs.mkdirSync(vendorDir, { recursive: true });

		const entryFile = path.join(stylesDir, 'main.css');
		const importedFile = path.join(vendorDir, 'component.css');

		fs.writeFileSync(importedFile, '.component { color: red; }');
		fs.writeFileSync(entryFile, `@import './vendor/component.css';\n.root { display: flex; }`);

		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /\.css$/,
			},
		});

		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});

		plugin.setContext(config);
		await plugin.setup();

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as IClientBridge;

		const bridgeSpy = vi.spyOn(Bridge, 'cssUpdate');

		// Modify the imported file
		fs.writeFileSync(importedFile, '.component { color: blue; }');

		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChanges) {
			throw new Error('Plugin does not have watch handler');
		}

		await watchConfig.onChanges({ created: [], changed: [importedFile], deleted: [], bridge: Bridge });

		// css-update should be broadcast for the ENTRY file, not the imported file
		expect(bridgeSpy).toHaveBeenCalledWith(entryFile);
		expect(bridgeSpy).not.toHaveBeenCalledWith(importedFile);
	});

	test('nested transitive imports resolve to the root entry file', async () => {
		const stylesDir = path.join(srcDir, 'styles_nested_test');
		const vendorDir = path.join(stylesDir, 'vendor');
		const deepDir = path.join(vendorDir, 'deep');
		fs.mkdirSync(deepDir, { recursive: true });

		const entryFile = path.join(stylesDir, 'main.css');
		const midFile = path.join(vendorDir, 'mid.css');
		const deepFile = path.join(deepDir, 'deep.css');

		fs.writeFileSync(deepFile, '.deep { color: green; }');
		fs.writeFileSync(midFile, `@import './deep/deep.css';\n.mid { color: blue; }`);
		fs.writeFileSync(entryFile, `@import './vendor/mid.css';\n.root { display: grid; }`);

		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /\.css$/,
			},
		});

		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});

		plugin.setContext(config);
		await plugin.setup();

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as IClientBridge;

		const bridgeSpy = vi.spyOn(Bridge, 'cssUpdate');

		// Modify the deeply nested file
		fs.writeFileSync(deepFile, '.deep { color: purple; }');

		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChanges) {
			throw new Error('Plugin does not have watch handler');
		}

		await watchConfig.onChanges({ created: [], changed: [deepFile], deleted: [], bridge: Bridge });

		// css-update should be broadcast for the ancestor entry files, not the leaf dependency
		expect(bridgeSpy).toHaveBeenCalledWith(entryFile);
		expect(bridgeSpy).not.toHaveBeenCalledWith(deepFile);
		// midFile is ALSO a tracked entry that imports deep.css, so it correctly gets a broadcast too
		expect(bridgeSpy).toHaveBeenCalledWith(midFile);
	});

	test('entry file without imports should still HMR directly', async () => {
		const stylesDir = path.join(srcDir, 'styles_direct_test');
		fs.mkdirSync(stylesDir, { recursive: true });

		const standaloneFile = path.join(stylesDir, 'standalone.css');
		fs.writeFileSync(standaloneFile, '.standalone { color: red; }');

		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /\.css$/,
			},
		});

		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});

		plugin.setContext(config);
		await plugin.setup();

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as IClientBridge;

		const bridgeSpy = vi.spyOn(Bridge, 'cssUpdate');

		fs.writeFileSync(standaloneFile, '.standalone { color: blue; }');

		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChanges) {
			throw new Error('Plugin does not have watch handler');
		}

		await watchConfig.onChanges({ created: [], changed: [standaloneFile], deleted: [], bridge: Bridge });

		// css-update should be broadcast directly for the standalone file
		expect(bridgeSpy).toHaveBeenCalledWith(standaloneFile);
	});

	test('process should preserve BEM selectors with nesting plugins during direct asset-pipeline calls', async () => {
		const pagesDir = path.join(srcDir, 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const cssFile = path.join(pagesDir, 'api-lab.css');

		fs.writeFileSync(cssFile, ['.api-lab {', '\t&__workspace-grid {', '\t\tdisplay: grid;', '\t}', '}'].join('\n'));

		const plugin = new PostCssProcessorPlugin({
			options: {
				plugins: {
					'postcss-nested': postcssNested(),
				},
			},
		});

		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});

		plugin.setContext(config);
		await plugin.setup();

		const result = await plugin.process(fs.readFileSync(cssFile, 'utf-8'), cssFile);

		expect(result).toContain('.api-lab__workspace-grid');
		expect(result).not.toContain('__workspace-grid.api-lab');
		expect(result).toContain('display: grid');
	});

	test('persists production CSS under a hash of the processed bytes', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		try {
			const cssFile = path.join(srcDir, 'hashed-production.css');
			fs.writeFileSync(cssFile, '.hashed { color: orange; }');

			const plugin = new PostCssProcessorPlugin({
				options: {
					filter: /\.css$/,
				},
			});
			const config = await finalizeEcoPagesConfig({
				rootDir: tmpDir,
				srcDir: 'src',
				distDir: 'dist',
				baseUrl: 'http://localhost:3000',
			});
			plugin.setContext(config);
			await plugin.setup();

			expect(hashedCssContents().some((css) => css.includes('.hashed { color: orange; }'))).toBe(true);
			expect(fs.existsSync(path.join(distDir, 'assets', 'hashed-production.css'))).toBe(false);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
