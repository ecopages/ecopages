import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { PostCssProcessor } from '../postcss-processor';
import { createAppAwarePostcssImport, resolveAppRootFromPath } from '../postcss-import-app-aware';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('resolveAppRootFromPath', () => {
	test('should resolve the postcss-processor package root from a nested css file', () => {
		const cssPath = path.resolve(__dirname, 'css/tailwind-reference.css');
		const appRoot = resolveAppRootFromPath(cssPath);

		expect(appRoot).toBe(path.resolve(__dirname, '../..'));
	});
});

describe('createAppAwarePostcssImport', () => {
	test('should resolve hoisted bare package imports through package exports', async () => {
		const tempRoot = mkdtempSync(path.join(tmpdir(), 'ecopages-postcss-import-'));
		tempDirs.push(tempRoot);

		const appRoot = path.join(tempRoot, 'apps', 'synapse');
		const stylesDir = path.join(appRoot, 'src', 'styles');
		const packageDir = path.join(tempRoot, 'node_modules', '@tools', 'ai-tools-ui');

		mkdirSync(stylesDir, { recursive: true });
		mkdirSync(path.join(packageDir, 'styles'), { recursive: true });

		writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'synapse-app', private: true }));
		writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({
				name: '@tools/ai-tools-ui',
				exports: {
					'./styles/theme': './styles/theme.css',
				},
			}),
		);
		writeFileSync(path.join(packageDir, 'styles', 'theme.css'), '.theme{color:red}');

		const result = await PostCssProcessor.processStringOrBuffer('@import "@tools/ai-tools-ui/styles/theme";', {
			filePath: path.join(stylesDir, 'reference.css'),
			plugins: [createAppAwarePostcssImport(appRoot)],
		});

		expect(result).toContain('.theme{color:red}');
	});
});
