import { describe, it } from 'vitest';
import { stylesheetProcessorContract } from '@ecopages/core/processor/contract';
import { LightningCssProcessorPlugin } from '../plugin';

describe('stylesheet Processor contract, for the Lightning CSS Processor', () => {
	const cases = stylesheetProcessorContract({
		createProcessor: () => new LightningCssProcessorPlugin({ options: {} }),
		invalidCss: '.broken { color: red; }\n}\n',
	});
	for (const contractCase of cases) {
		it(contractCase.name, contractCase.run);
	}
});

describe('stylesheet Processor contract, for the Lightning CSS Processor scoping CSS Modules', () => {
	const cases = stylesheetProcessorContract({
		createProcessor: () => new LightningCssProcessorPlugin({ options: {} }),
		invalidCss: '.broken { color: red; }\n}\n',
		cssModules: true,
	});
	for (const contractCase of cases) {
		it(contractCase.name, contractCase.run);
	}
});
