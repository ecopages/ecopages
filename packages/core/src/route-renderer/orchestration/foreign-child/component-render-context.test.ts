import { describe, expect, it } from 'vitest';
import { getComponentRenderContext, runWithComponentRenderContext } from './component-render-context.ts';

describe('runWithComponentRenderContext', () => {
	it('restores the parent render after an awaited nested render', async () => {
		const outer = await runWithComponentRenderContext({ currentIntegration: 'react' }, async () => {
			const nested = await runWithComponentRenderContext({ currentIntegration: 'lit' }, async () => {
				await Promise.resolve();
				return getComponentRenderContext()?.currentIntegration;
			});

			return {
				nestedIntegration: nested.value,
				parentIntegration: getComponentRenderContext()?.currentIntegration,
			};
		});

		expect(outer.value).toEqual({
			nestedIntegration: 'lit',
			parentIntegration: 'react',
		});
	});
});
