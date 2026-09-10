import { describe, expect, test } from 'vitest';
import { runWithComponentRenderContext } from '@ecopages/core/route-renderer/orchestration/foreign-child/component-render-context';
import { assertContentEntryOwnerLane } from '../ownership.ts';

describe('assertContentEntryOwnerLane', () => {
	test('throws when a react-owned entry is invoked in a foreign lane', async () => {
		await expect(
			runWithComponentRenderContext({ currentIntegration: 'ecopages-jsx' }, async () => {
				assertContentEntryOwnerLane('/app/src/content/docs/intro.mdx', 'react');
			}),
		).rejects.toThrow(/owned by the "react" integration/);
	});

	test('throws when a host-owned entry is invoked in a react lane', async () => {
		await expect(
			runWithComponentRenderContext({ currentIntegration: 'react' }, async () => {
				assertContentEntryOwnerLane('/app/src/content/docs/intro.mdx', 'ecopages-jsx');
			}),
		).rejects.toThrow(/owned by the "ecopages-jsx" integration/);
	});

	test('passes in the owning lane and when no render context is active', async () => {
		await expect(
			runWithComponentRenderContext({ currentIntegration: 'react' }, async () => {
				assertContentEntryOwnerLane('/app/src/content/docs/intro.mdx', 'react');
			}),
		).resolves.toEqual({ value: undefined });

		expect(() => assertContentEntryOwnerLane('/app/src/content/docs/intro.mdx', 'react')).not.toThrow();
		expect(() => assertContentEntryOwnerLane('/app/src/content/docs/intro.mdx', undefined)).not.toThrow();
	});
});
