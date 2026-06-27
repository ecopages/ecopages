import { describe, expect, it } from 'vitest';
import { StringMarkupRenderer } from '../route-renderer/orchestration/string-markup-renderer.ts';
import { defineIntegration } from './define-integration.ts';

class ExampleRenderer extends StringMarkupRenderer {
	name = 'example';
}

describe('defineIntegration', () => {
	const examplePlugin = defineIntegration({
		name: 'example',
		extensions: ['.example'],
		renderer: ExampleRenderer,
	});

	it('creates a plugin with the declared config', () => {
		const plugin = examplePlugin();

		expect(plugin.name).toBe('example');
		expect(plugin.extensions).toEqual(['.example']);
		expect(plugin.renderer).toBe(ExampleRenderer);
	});

	it('merges factory options over defaults', () => {
		const plugin = examplePlugin({
			extensions: ['.example', '.ex'],
			jsxImportSource: '@example/jsx',
		});

		expect(plugin.extensions).toEqual(['.example', '.ex']);
		expect(plugin.jsxImportSource).toBe('@example/jsx');
	});

	it('exposes the generated plugin class', () => {
		const plugin = new examplePlugin.Plugin();

		expect(plugin).toBeInstanceOf(examplePlugin.Plugin);
		expect(plugin.name).toBe('example');
	});
});
