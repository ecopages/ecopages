import type { CssRuntimeProcessor, CssTransform } from './css-runtime-contract';

export const createCssRuntimeProcessor = (transform: CssTransform): CssRuntimeProcessor => {
	return async (contents, filePath) =>
		transform({
			contents,
			filePath,
		});
};

export const createNodeCssProcessor = createCssRuntimeProcessor;
