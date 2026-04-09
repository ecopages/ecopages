import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';

import { getFileAsBuffer } from '../postcss-processor.ts';
import type { CssTransform } from './css-runtime-contract.ts';

type CssLoaderOptions = {
	name: string;
	filter: RegExp;
	transform: CssTransform;
};

export const createCssLoaderPlugin = ({ name, filter, transform }: CssLoaderOptions): EcoBuildPlugin => ({
	name,
	setup(build) {
		build.onLoad({ filter }, (args) => {
			const rawFile = getFileAsBuffer(args.path);
			const css = transform({
				contents: rawFile,
				filePath: args.path,
			});

			if (css instanceof Promise) {
				return css.then((resolved) => ({
					exports: { default: resolved },
					loader: 'object' as const,
				}));
			}

			return {
				exports: {
					default: css as string,
				},
				loader: 'object' as const,
			};
		});
	},
});
