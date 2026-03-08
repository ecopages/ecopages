import { describe, expect, test, afterAll, beforeAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import postcss from 'postcss';
import { PostCssProcessorPlugin } from '../plugin';
import type { ClientBridge } from '@ecopages/core/adapters/bun/client-bridge';
import { ConfigBuilder } from '@ecopages/core/config-builder';

const TMP_DIR = path.join(__dirname, 'tmp_test_hmr');
const SRC_DIR = path.join(TMP_DIR, 'src');
const DIST_DIR = path.join(TMP_DIR, 'dist');

describe('PostCssProcessorPlugin HMR', () => {
	beforeAll(() => {
		if (fs.existsSync(TMP_DIR)) {
			fs.rmSync(TMP_DIR, { recursive: true, force: true });
		}
		fs.mkdirSync(SRC_DIR, { recursive: true });
		fs.mkdirSync(DIST_DIR, { recursive: true });
	});

	afterAll(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	test('handleCssChange should apply transformInput', async () => {
		const cssFile = path.join(SRC_DIR, 'style.css');
		fs.writeFileSync(cssFile, '.foo { color: red; }');

		const plugin = new PostCssProcessorPlugin({
			options: {
				filter: /\.css$/,
				transformInput: async (content) => {
					return `/* prefix */\n${content}`;
				},
			},
		});

		const config = await new ConfigBuilder()
			.setRootDir(TMP_DIR)
			.setSrcDir('src')
			.setDistDir('dist')
			.setBaseUrl('http://localhost:3000')
			.build();

		plugin.setContext(config);

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as ClientBridge;

		const bridgeSpy = vi.spyOn(Bridge, 'cssUpdate');

		const watchConfig = plugin.getWatchConfig();
		if (watchConfig && watchConfig.onChange) {
			await watchConfig.onChange({ path: cssFile, bridge: Bridge });
		} else {
			throw new Error('Plugin does not have watch handler');
		}

		const outputFile = path.join(DIST_DIR, 'assets', 'style.css');
		expect(fs.existsSync(outputFile)).toBe(true);

		const outputContent = fs.readFileSync(outputFile, 'utf-8');
		expect(outputContent).toContain('/* prefix */');
		expect(outputContent).toContain('.foo { color: red; }');

		expect(bridgeSpy).toHaveBeenCalled();
		expect(bridgeSpy).toHaveBeenCalledWith(cssFile);
	});

	test('dependency changes should rebuild tracked CSS with fresh plugin instances', async () => {
		const cssFile = path.join(SRC_DIR, 'style.css');
		const dependencyFile = path.join(SRC_DIR, 'component.tsx');
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

		const config = await new ConfigBuilder()
			.setRootDir(TMP_DIR)
			.setSrcDir('src')
			.setDistDir('dist')
			.setBaseUrl('http://localhost:3000')
			.build();

		plugin.setContext(config);
		await plugin.setup();

		const Bridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as ClientBridge;

		const bridgeSpy = vi.spyOn(Bridge, 'cssUpdate');
		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChange) {
			throw new Error('Plugin does not have watch handler');
		}

		activeColor = 'blue';
		await watchConfig.onChange({ path: dependencyFile, bridge: Bridge });

		const outputFile = path.join(DIST_DIR, 'assets', 'style.css');
		const outputContent = fs.readFileSync(outputFile, 'utf-8');

		expect(outputContent).toContain('color: blue');
		expect(bridgeSpy).toHaveBeenCalledWith(cssFile);
	});
});
