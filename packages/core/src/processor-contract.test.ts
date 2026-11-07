import { describe, it } from 'vitest';
import { InliningProcessor } from './__fixtures__/stylesheets/inlining-processor.ts';
import { stylesheetProcessorContract } from './processor-contract.ts';

describe('stylesheet Processor contract, for a fixture Processor', () => {
	const cases = stylesheetProcessorContract({
		createProcessor: () => new InliningProcessor(),
	});
	for (const contractCase of cases) {
		it(contractCase.name, contractCase.run);
	}
});
