import { describe, expect, test, afterAll, beforeAll, spyOn } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import { PostCssProcessorPlugin } from '../plugin';
import type { ClientBridge } from '@ecopages/core/adapters/bun/client-bridge';
import { ConfigBuilder } from '@ecopages/core/config-builder';

const TMP_DIR = path.join(import.meta.dir, 'tmp_test_hmr');
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

		const mockBridge = {
			cssUpdate: () => {},
			error: (msg: string) => {
				throw new Error(msg);
			},
			reload: () => {},
		} as unknown as ClientBridge;

		const bridgeSpy = spyOn(mockBridge, 'cssUpdate');

		const watchConfig = plugin.getWatchConfig();
		if (watchConfig && watchConfig.onChange) {
			await watchConfig.onChange({ path: cssFile, bridge: mockBridge });
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
});
