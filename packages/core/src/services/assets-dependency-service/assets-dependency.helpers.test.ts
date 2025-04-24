import { expect, test } from 'bun:test';
import { AssetDependencyHelpers } from './assets-dependency.helpers';

test('AssetDependencyHelpers - createInlineScriptAsset', () => {
  const asset = AssetDependencyHelpers.createInlineContentScript({
    content: 'console.log("test")',
  });
  expect(asset.kind).toBe('script');
  expect(asset.source).toBe('content');
  expect(asset.inline).toBe(true);
  expect(asset.position).toBe('body');
});

test('AssetDependencyHelpers - createSrcScriptAsset', () => {
  const asset = AssetDependencyHelpers.createFileScript({
    filepath: 'https://test.com/script.js',
  });
  expect(asset.kind).toBe('script');
  expect(asset.source).toBe('file');
});

test('AssetDependencyHelpers - createJsonAssetScript', () => {
  const asset = AssetDependencyHelpers.createJsonScript({
    content: '{"test": true}',
  });
  expect(asset.kind).toBe('script');
  expect(asset.source).toBe('content');
  expect(asset.attributes?.type).toBe('application/json');
});

test('AssetDependencyHelpers - createInlineStylesheetAsset', () => {
  const asset = AssetDependencyHelpers.createInlineContentStylesheet({
    content: 'body { color: red; }',
  });
  expect(asset.kind).toBe('stylesheet');
  expect(asset.source).toBe('content');
  expect(asset.position).toBe('head');
});

test('AssetDependencyHelpers - createPreBundledScriptAsset', () => {
  const asset = AssetDependencyHelpers.createPreBundledScript({
    filepath: '/dist/bundle.js',
  });
  expect(asset.kind).toBe('script');
  expect(asset.source).toBe('file');
  expect(asset.preBundled).toBe(true);
});

test('AssetDependencyHelpers - createPreBundledStylesheetAsset', () => {
  const asset = AssetDependencyHelpers.createPreBundledStylesheet({
    filepath: '/dist/styles.css',
  });
  expect(asset.kind).toBe('stylesheet');
  expect(asset.source).toBe('file');
  expect(asset.preBundled).toBe(true);
});

test('AssetDependencyHelpers - createContentScript', () => {
  const asset = AssetDependencyHelpers.createContentScript({
    content: 'console.log("test")',
  });
  expect(asset.kind).toBe('script');
  expect(asset.source).toBe('content');
  expect(asset.position).toBe('body');
});

test('AssetDependencyHelpers - createInlineContentScript', () => {
  const asset = AssetDependencyHelpers.createInlineContentScript({
    content: 'console.log("test")',
  });
  expect(asset.inline).toBe(true);
  expect(asset.source).toBe('content');
});

test('AssetDependencyHelpers - createFileScript', () => {
  const asset = AssetDependencyHelpers.createFileScript({
    filepath: '/path/to/script.js',
  });
  expect(asset.kind).toBe('script');
  expect(asset.source).toBe('file');
});
