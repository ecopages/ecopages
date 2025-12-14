import mdx from '@mdx-js/esbuild';

/**
 * @deprecated Use @ecopages/mdx plugin instead.
 *
 * A bun plugin to process mdx files using mdx
 * Just add this plugin to your bunfig.toml file and it will process all .mdx files
 * It uses the @kitajs/html jsxImportSource
 * @example
 * ```toml
 * preload = ["@ecopages/bun-mdx-kitajs-loader"]
 * ```
 */
console.warn('[@ecopages/bun-mdx-kitajs-loader] This package is deprecated. Please use @ecopages/mdx plugin instead.');

Bun.plugin(
	// @ts-expect-error: esbuild plugin vs bun plugin
	mdx({
		format: 'detect',
		outputFormat: 'program',
		jsxImportSource: '@kitajs/html',
	}),
);
