import { expect, test } from 'bun:test';
import { AssetFactory } from './asset.factory';

test('AssetFactory - createInlineScriptAsset', () => {
	const asset = AssetFactory.createInlineContentScript({
		content: 'console.log("test")',
	});
	expect(asset.kind).toBe('script');
	expect(asset.source).toBe('content');
	expect(asset.inline).toBe(true);
	expect(asset.position).toBe('body');
});

test('AssetFactory - createSrcScriptAsset', () => {
	const asset = AssetFactory.createFileScript({
		filepath: 'https://test.com/script.js',
	});
	expect(asset.kind).toBe('script');
	expect(asset.source).toBe('file');
});

test('AssetFactory - createJsonAssetScript', () => {
	const asset = AssetFactory.createJsonScript({
		content: '{"test": true}',
	});
	expect(asset.kind).toBe('script');
	expect(asset.source).toBe('content');
	expect(asset.attributes?.type).toBe('application/json');
});

test('AssetFactory - createInlineStylesheetAsset', () => {
	const asset = AssetFactory.createInlineContentStylesheet({
		content: 'body { color: red; }',
	});
	expect(asset.kind).toBe('stylesheet');
	expect(asset.source).toBe('content');
	expect(asset.position).toBe('head');
});

test('AssetFactory - createContentScript', () => {
	const asset = AssetFactory.createContentScript({
		content: 'console.log("test")',
	});
	expect(asset.kind).toBe('script');
	expect(asset.source).toBe('content');
	expect(asset.position).toBe('body');
});

test('AssetFactory - createInlineContentScript', () => {
	const asset = AssetFactory.createInlineContentScript({
		content: 'console.log("test")',
	});
	expect(asset.inline).toBe(true);
	expect(asset.source).toBe('content');
});

test('AssetFactory - createFileScript', () => {
	const asset = AssetFactory.createFileScript({
		filepath: '/path/to/script.js',
	});
	expect(asset.kind).toBe('script');
	expect(asset.source).toBe('file');
});
