import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
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
		const tempRoot = path.fromNative(mkdtempSync(path.join(tmpdir(), 'ecopages-postcss-import-')));
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

	test('rebases the relative urls of inlined files onto the importing stylesheet', async () => {
		const tempRoot = mkdtempSync(path.join(tmpdir(), 'ecopages-postcss-import-'));
		tempDirs.push(tempRoot);

		const appRoot = path.join(tempRoot, 'app');
		const stylesDir = path.join(appRoot, 'src', 'styles');
		const packageDir = path.join(appRoot, 'node_modules', '@fontsource', 'mono');
		mkdirSync(path.join(stylesDir, 'partials'), { recursive: true });
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'app', private: true }));
		writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({ name: '@fontsource/mono', style: 'index.css' }),
		);
		writeFileSync(
			path.join(packageDir, 'index.css'),
			"@font-face{src:url(files/mono.woff2?v=1) format('woff2'),url('./files/mono.woff') format('woff'),url(data:font/woff2;base64,AA)}",
		);
		writeFileSync(
			path.join(stylesDir, 'partials', 'bg.css'),
			'.bg{background:url("../images/bg.png#x"),url(/root.png)}',
		);

		const result = await PostCssProcessor.processStringOrBuffer(
			"@import '@fontsource/mono';\n@import './partials/bg.css';\n.own{background:url(own.png)}",
			{ filePath: path.join(stylesDir, 'site.css'), plugins: [createAppAwarePostcssImport(appRoot)] },
		);

		expect(result).toContain(
			'src:url("../../node_modules/@fontsource/mono/files/mono.woff2?v=1") format(\'woff2\'),url("../../node_modules/@fontsource/mono/files/mono.woff") format(\'woff\'),url(data:font/woff2;base64,AA)',
		);
		expect(result).toContain('.bg{background:url("images/bg.png#x"),url(/root.png)}');
		expect(result).toContain('.own{background:url(own.png)}');
	});

	test('rebases an inlined package url wherever it points and leaves strings alone', async () => {
		const tempRoot = mkdtempSync(path.join(tmpdir(), 'ecopages-postcss-import-'));
		tempDirs.push(tempRoot);

		const appRoot = path.join(tempRoot, 'app');
		const stylesDir = path.join(appRoot, 'src', 'styles');
		const evilDir = path.join(appRoot, 'node_modules', 'evil');
		mkdirSync(path.join(evilDir, 'css'), { recursive: true });
		mkdirSync(stylesDir, { recursive: true });
		writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'app', private: true }));
		writeFileSync(path.join(appRoot, '.env'), 'SECRET=1');
		writeFileSync(path.join(evilDir, 'package.json'), JSON.stringify({ name: 'evil', style: 'css/index.css' }));
		writeFileSync(path.join(evilDir, 'css', 'index.css'), '.e{background:url(../../../.env)}');
		writeFileSync(path.join(stylesDir, 'quoted.css'), '.q{content:"url(x.png)";background:url(a\\(1\\).png)}');

		const plugins = [createAppAwarePostcssImport(appRoot)];
		const evil = await PostCssProcessor.processStringOrBuffer("@import 'evil';", {
			filePath: path.join(stylesDir, 'site.css'),
			plugins,
		});
		const quoted = await PostCssProcessor.processStringOrBuffer("@import './styles/quoted.css';", {
			filePath: path.join(appRoot, 'src', 'site.css'),
			plugins,
		});

		expect(evil).toBe('.e{background:url("../../.env")}');
		expect(quoted).toBe('.q{content:"url(x.png)";background:url("styles/a(1).png")}');
	});
});
