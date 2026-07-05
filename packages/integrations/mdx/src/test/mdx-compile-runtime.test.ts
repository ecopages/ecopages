import { describe, expect, it } from 'vitest';
import { resolveFunctionBodyCompileOptions } from '../core/mdx-compile-runtime.ts';

describe('resolveFunctionBodyCompileOptions', () => {
	it('should resolve function-body compile options for runtime MDX', () => {
		const options = resolveFunctionBodyCompileOptions(
			{
				remarkPlugins: [],
			},
			{
				jsxImportSource: '@ecopages/jsx',
				defaults: {
					format: 'detect',
					outputFormat: 'program',
				},
			},
		);

		expect(options.format).toBe('mdx');
		expect(options.outputFormat).toBe('function-body');
		expect(options.development).toBe(false);
		expect(options.jsxImportSource).toBe('@ecopages/jsx');
	});
});
