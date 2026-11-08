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
		/** `postcss-import` keeps the first instance of a stylesheet imported twice, where the cascade and Lightning CSS keep the last. */
		const test = contractCase.name === 'a stylesheet imported twice keeps its last instance' ? it.fails : it;
		test(contractCase.name, contractCase.run);
	}
});
