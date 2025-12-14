import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BunPlugin } from 'bun';

/**
 * The options for the bun postcss plugin
 * @param filter - The filter to apply to the plugin
 * @param namespace - The namespace to apply to the plugin
 * @param transform - The transform function to apply to the plugin
 * @param inputHeader - Optional input header to be added to the file
 */
type BunInlineCssPluginOptions = {
	filter?: RegExp;
	namespace?: string;
	transform?: (contents: string | Buffer, args: { path: string; [key: string]: any }) => Promise<string> | string;
};

function getFileAsBuffer(path: string): Buffer {
	try {
		if (!existsSync(path)) {
			throw new Error(`File: ${path} not found`);
		}
		return readFileSync(path);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`[ecopages] Error reading file: ${path}, ${errorMessage}`);
	}
}

/**
 * A bun plugin to process css files using postcss
 * @param options - {@link BunInlineCssPluginOptions}
 * @default options.filter - /\.css$/
 * @default options.namespace - 'bun-inline-css-plugin-namespace'
 * @default options.transform - async (contents: string | Buffer) => contents
 * @returns The bun plugin
 */
export const bunInlineCssPlugin = (options: BunInlineCssPluginOptions): BunPlugin => {
	const { filter, namespace, transform } = Object.assign(
		{
			filter: /\.css$/,
			namespace: 'bun-inline-css-plugin',
			transform: async (contents: string | Buffer) => contents,
		},
		options,
	);

	return {
		name: 'bun-inline-css-plugin',
		setup(build) {
			build.onResolve({ filter }, (args) => {
				const absoluteImporter = path.resolve(args.importer);
				const importerDir = path.dirname(absoluteImporter);
				const absolutePath = `${path.join(importerDir, args.path)}`;

				return {
					path: absolutePath,
					namespace,
				};
			});

			build.onLoad({ filter: /.*/, namespace }, async (args) => {
				const text = getFileAsBuffer(args.path).toString();
				return {
					contents: transform ? await transform(text, { path: args.path }) : text,
					loader: 'text',
				};
			});
		},
	};
};
