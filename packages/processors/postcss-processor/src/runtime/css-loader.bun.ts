import type { BunPlugin } from 'bun';

import { getFileAsBuffer } from '../postcss-processor';
import type { CssTransform } from './css-runtime-contract';

type BunCssLoaderOptions = {
	name: string;
	filter: RegExp;
	transform: CssTransform;
};

export const createBunCssLoaderPlugin = ({ name, filter, transform }: BunCssLoaderOptions): BunPlugin => ({
	name,
	setup(build) {
		build.onLoad({ filter }, async (args) => {
			const rawFile = await getFileAsBuffer(args.path);
			const css = await transform({
				contents: rawFile,
				filePath: args.path,
			});

			return {
				exports: {
					default: css,
				},
				loader: 'object',
			};
		});
	},
});
