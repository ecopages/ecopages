import { describe, expect, it } from 'vitest';
import type { PageClientPlan } from '../ownership-graph/page-client-plan.ts';
import { getComponentRenderContext, runWithComponentRenderContext } from './component-render-context.ts';

describe('component render context', () => {
	it('is absent outside a render', () => {
		expect(getComponentRenderContext()).toBeUndefined();
	});

	it('follows each render across awaits when renders overlap', async () => {
		let releaseBarrier: (() => void) | undefined;
		const barrier = new Promise<void>((resolve) => {
			releaseBarrier = resolve;
		});
		let waiting = 0;
		const readAfterBarrier = async () => {
			waiting += 1;
			if (waiting === 2) releaseBarrier?.();
			await barrier;
			return getComponentRenderContext()?.currentIntegration;
		};

		const [first, second] = await Promise.all([
			runWithComponentRenderContext({ currentIntegration: 'kitajs' }, readAfterBarrier),
			runWithComponentRenderContext({ currentIntegration: 'react' }, readAfterBarrier),
		]);

		expect([first.value, second.value]).toEqual(['kitajs', 'react']);
		expect(getComponentRenderContext()).toBeUndefined();
	});

	it('lets a nested render inherit the plan of its parent and leaves the parent unchanged', async () => {
		const pageClientPlan = { currentIntegrationName: 'kitajs' } as PageClientPlan;

		const { value } = await runWithComponentRenderContext(
			{ currentIntegration: 'kitajs', pageClientPlan },
			async () => {
				const nested = await runWithComponentRenderContext({ currentIntegration: 'lit' }, async () => ({
					integration: getComponentRenderContext()?.currentIntegration,
					plan: getComponentRenderContext()?.pageClientPlan,
				}));
				return { nested: nested.value, after: getComponentRenderContext()?.currentIntegration };
			},
		);

		expect(value.nested).toEqual({ integration: 'lit', plan: pageClientPlan });
		expect(value.after).toBe('kitajs');
	});

	it('is gone after a render that throws', async () => {
		await expect(
			runWithComponentRenderContext({ currentIntegration: 'kitajs' }, async () => {
				throw new Error('render failed');
			}),
		).rejects.toThrow('render failed');

		expect(getComponentRenderContext()).toBeUndefined();
	});
});
