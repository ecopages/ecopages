import type { EcoBuildPlugin } from '@ecopages/core/processor';

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

			const toModule = (resolved: string) => ({
				contents: `export default ${JSON.stringify(resolved)};`,
				loader: 'js' as const,
			});
			return css instanceof Promise ? css.then(toModule) : toModule(css);
		});
	},
});
