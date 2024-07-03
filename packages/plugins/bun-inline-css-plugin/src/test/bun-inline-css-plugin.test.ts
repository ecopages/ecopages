import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import { bunInlineCssPlugin } from '../bun-inline-css-plugin.ts';

const outdir = path.resolve(__dirname, '../../dist');

afterEach(() => {
  if (fs.existsSync(outdir)) {
    fs.rmSync(outdir, { recursive: true });
  }
});

describe('bunPostCssPlugin', () => {
  test('bunPostCssPlugin should return the postcss file with default transformation', async () => {
    const filePath = path.resolve(__dirname, './correct.ts');
    const expected = '.test {\n  @apply bg-red-500;\n}\n';

    const build = await Bun.build({
      entrypoints: [filePath],
      outdir,
      root: __dirname,
      plugins: [bunInlineCssPlugin({})],
    });

    const processedFile = build.outputs[0].path;
    const result = await import(processedFile).then((res) => res.default);

    expect(result.default).toEqual(expected);
  });

  test('bunPostCssPlugin should build correctly the css file with a custom postcss processor', async () => {
    const filePath = path.resolve(__dirname, './correct.ts');
    const expected = '.test{--tw-bg-opacity:1;background-color:rgb(239 68 68/var(--tw-bg-opacity))}';

    const build = await Bun.build({
      entrypoints: [filePath],
      outdir,
      plugins: [
        bunInlineCssPlugin({
          transform: (text) => PostCssProcessor.processStringOrBuffer(text),
        }),
      ],
    });

    const processedFile = build.outputs[0].path;
    const result = await import(processedFile).then((res) => res.default);

    expect(result).toEqual(result);
  });

  test('On error bunPostCssPlugin should return the postcss file without transformation', async () => {
    const filePath = path.resolve(__dirname, './with-error.ts');
    const expected = '.test {\n  @apply bg-reds-500;\n}\n';

    const build = await Bun.build({
      entrypoints: [filePath],
      outdir,
      root: __dirname,
      plugins: [bunInlineCssPlugin({})],
    });

    const processedFile = build.outputs[0].path;
    const result = await import(processedFile).then((res) => res.default);

    expect(result.default).toEqual(expected);
  });
});
