import { compile, run, type CompileOptions, type RunOptions } from '@mdx-js/mdx';
import { pathToFileURL } from 'node:url';
import { VFile } from 'vfile';
import { type MdxCompilerOptionsInput, resolveMdxCompilerOptions } from './mdx-utils.ts';
import type { JsxImportSource } from './jsx-import-source.ts';

export type MdxFunctionBodyRunScope = Record<string, unknown> & {
	Fragment: unknown;
	jsx: unknown;
	jsxs: unknown;
};

/**
 * Resolves MDX compiler options for the `compile()` + `run()` content pipeline.
 *
 * @remarks
 * Use this for body-only MDX compiled at request or static-generation time instead
 * of emitting a standalone JS module through the bundler loader.
 */
export function resolveFunctionBodyCompileOptions(
	mdxOptions: MdxCompilerOptionsInput,
	options: {
		jsxImportSource: JsxImportSource;
		jsxRuntime?: CompileOptions['jsxRuntime'];
		defaults?: CompileOptions;
	},
): CompileOptions {
	return {
		...resolveMdxCompilerOptions(mdxOptions, options),
		format: 'mdx',
		outputFormat: 'function-body',
		development: false,
	};
}

/**
 * Compiles MDX source to a callable default export using `@mdx-js/mdx` `compile()` + `run()`.
 */
export async function compileMdxFunctionBody(options: {
	source: string;
	filePath: string;
	compilerOptions: CompileOptions;
	runScope: MdxFunctionBodyRunScope;
}): Promise<{ default: (...args: unknown[]) => unknown }> {
	const compiled = await compile(
		new VFile({
			value: options.source,
			path: options.filePath,
		}),
		options.compilerOptions,
	);

	return run(compiled, {
		...options.runScope,
		baseUrl: pathToFileURL(options.filePath).href,
	} as RunOptions) as Promise<{ default: (...args: unknown[]) => unknown }>;
}
