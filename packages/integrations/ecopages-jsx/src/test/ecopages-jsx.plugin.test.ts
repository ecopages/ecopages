import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { EcopagesJsxPlugin, ecopagesJsxPlugin } from '../ecopages-jsx.plugin.ts';

function getMdxLoaderFilter(plugin: EcoBuildPlugin): RegExp {
	let capturedFilter: RegExp | undefined;

	plugin.setup({
		onLoad(options) {
			capturedFilter = options.filter;
		},
		onResolve() {},
		module() {},
	});

	assert.ok(capturedFilter, 'Expected MDX loader plugin to register an onLoad filter.');
	return capturedFilter;
}

test('EcopagesJsxPlugin matches custom multi-dot MDX extensions exactly', async () => {
	const plugin = ecopagesJsxPlugin({
		radiant: false,
		mdx: {
			enabled: true,
			extensions: ['.story.mdx'],
		},
	});

	await plugin.prepareBuildContributions();

	const mdxLoaderPlugin = plugin.plugins[0];
	assert.ok(mdxLoaderPlugin, 'Expected Ecopages JSX plugin to expose the MDX loader plugin.');

	const filter = getMdxLoaderFilter(mdxLoaderPlugin);

	assert.equal(filter.test('/tmp/src/pages/component.story.mdx'), true);
	assert.equal(filter.test('/tmp/src/pages/component.story.mdx?import'), true);
	assert.equal(filter.test('/tmp/src/pages/componentXstory.mdx'), false);
	assert.equal(filter.test('/tmp/src/pages/component-story-mdx'), false);
});

test('EcopagesJsxPlugin supports direct construction with default public options', () => {
	const plugin = new EcopagesJsxPlugin();

	assert.deepEqual(plugin.extensions, ['.tsx']);
});

test('EcopagesJsxPlugin supports direct construction with MDX public options', () => {
	const plugin = new EcopagesJsxPlugin({
		extensions: ['.eco.tsx'],
		mdx: {
			enabled: true,
			extensions: ['.guide.mdx'],
		},
	});

	assert.deepEqual(plugin.extensions, ['.eco.tsx', '.guide.mdx']);
	assert.deepEqual((plugin as any).mdxExtensions, ['.guide.mdx']);
});
