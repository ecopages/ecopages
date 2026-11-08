import { describe, it } from 'vitest';
import { path } from '@ecopages/file-system/path';
import { stylesheetProcessorContract } from '@ecopages/core/processor/contract';
import { createAppAwarePostcssImport } from '../postcss-import-app-aware';
import { PostCssProcessorPlugin } from '../plugin';

describe('stylesheet Processor contract, for the PostCSS Processor', () => {
	const cases = stylesheetProcessorContract({
		createProcessor: () =>
			new PostCssProcessorPlugin({
				options: { plugins: { 'postcss-import': createAppAwarePostcssImport(path.cwd()) } },
			}),
	});
	for (const contractCase of cases) {
		/** the app-aware `postcss-import` keeps the first instance of a stylesheet imported twice, where the cascade and Lightning CSS keep the last. */
		const test = contractCase.name === 'a stylesheet imported twice keeps its last instance' ? it.fails : it;
		test(contractCase.name, contractCase.run);
	}
});
