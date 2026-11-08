import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { LightningCssProcessorPlugin, type LightningCssProcessorPluginConfig } from '../plugin';

let rootDir: string;
const write = (relativePath: string, contents: string): string => {
	const file = path.join(rootDir, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
	return file;
};

async function transform(file: string, options: LightningCssProcessorPluginConfig = {}) {
	const plugin = new LightningCssProcessorPlugin({ options });
	plugin.setContext(await finalizeEcoPagesConfig({ rootDir, srcDir: 'src', distDir: 'dist' }));
	return plugin.transformStylesheet(fs.readFileSync(file, 'utf8'), file);
}

describe('Sass-style suffix nesting', () => {
	beforeEach(() => {
		rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-invalid-')));
	});

	afterEach(() => {
		fs.rmSync(rootDir, { recursive: true, force: true });
	});

	test('fails with the file, the position, the selector and a hint', async () => {
		const file = write('src/button.css', '.button {\n  color: red;\n  &--primary {\n    color: blue;\n  }\n}\n');

		const failure = await transform(file).catch((error: Error) => error);

		expect(failure).toBeInstanceOf(Error);
		const { message } = failure as Error;
		expect(message).toContain(`${file}:3:3`);
		expect(message).toContain('&--primary');
		expect(message).toContain('Sass-style suffix nesting');
		expect(message).toContain('.button--primary');
	});

	test.each([
		['lowered for old browsers', { targets: ['chrome 80'] }],
		['kept for new browsers', { targets: ['chrome 130'] }],
		['minified', { minify: true }],
		['with error recovery', { errorRecovery: true }],
	])('fails whether the nesting is %s', async (_name, options) => {
		const file = write('src/a.css', '.a { &__element { color: red; } }');

		await expect(transform(file, options)).rejects.toThrow(/&__element/u);
	});

	test('names every offending rule, in the file that wrote it', async () => {
		write('src/parts.css', '.card { &--wide { margin: 0; } }\n');
		const file = write('src/main.css', '@import "./parts.css";\n.menu {\n  &-item { color: red; }\n}\n');

		const failure = (await transform(file).catch((error: Error) => error)) as Error;

		expect(failure.message).toContain(`${path.join(rootDir, 'src/parts.css')}:1:`);
		expect(failure.message).toContain('&--wide');
		expect(failure.message).toContain(`${file}:3:`);
		expect(failure.message).toContain('&-item');
	});

	test('fails a CSS Module', async () => {
		const file = write('src/button.module.css', '.button { &--primary { color: red; } }');

		await expect(transform(file)).rejects.toThrow(/&--primary/u);
	});

	test('still fails with a visitor of the app', async () => {
		const file = write('src/a.css', '.a { &--b { color: red; } }');

		await expect(transform(file, { visitor: { Rule: { style: () => undefined } } })).rejects.toThrow(/&--b/u);
	});

	test('accepts native nesting', async () => {
		const file = write(
			'src/a.css',
			'.a { color: red; &:hover { color: blue; } & .b { color: green; } &.c { color: pink; } .d & { color: white; } & > p { margin: 0; } }',
		);

		const { css } = await transform(file, { minify: true });

		expect(css).toContain('&:hover');
		expect(css).toContain('&.c');
	});
});
