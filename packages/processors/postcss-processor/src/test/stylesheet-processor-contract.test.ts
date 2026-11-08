import { describe, it } from 'vitest';
import postcssImport from 'postcss-import';
import { stylesheetProcessorContract } from '@ecopages/core/processor/contract';
import { PostCssProcessorPlugin } from '../plugin';

describe('stylesheet Processor contract, for the PostCSS Processor', () => {
	const cases = stylesheetProcessorContract({
		createProcessor: () =>
			new PostCssProcessorPlugin({ options: { plugins: { 'postcss-import': postcssImport() } } }),
	});
	for (const contractCase of cases) {
		it(contractCase.name, contractCase.run);
	}
});
