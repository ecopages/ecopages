import { describe, expect, test } from 'vitest';
import type { EcoComponent } from '@ecopages/core';
import { runWithComponentRenderContext } from '@ecopages/core/route-renderer/orchestration/foreign-child/component-render-context';
import { assertContentEntryOwnerLane, invokeContentEntry } from '../ownership.ts';

type TestContentEntryComponent = EcoComponent & ((props: Record<string, unknown>) => unknown);

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

	test('uses the core interception contract for asynchronous foreign handoff', async () => {
		const component = (() => 'content') as unknown as TestContentEntryComponent;
		const page = () => 'inline';
		const result = await runWithComponentRenderContext(
			{
				currentIntegration: 'ecopages-jsx',
				foreignChildRuntime: {
					interceptForeignChild: async () => ({ kind: 'resolved', value: 'foreign-html' }),
				},
			},
			async () => invokeContentEntry('/app/content/entry.mdx', 'react', component, page, {}),
		);

		expect(result.value).toBe('foreign-html');
	});

	test('uses the sync interception fallback when no async method is provided', async () => {
		const component = (() => 'content') as unknown as TestContentEntryComponent;
		const page = () => 'inline';
		const result = await runWithComponentRenderContext(
			{
				currentIntegration: 'ecopages-jsx',
				foreignChildRuntime: {
					interceptForeignChildSync: () => ({ kind: 'resolved', value: 'foreign-html' }),
				},
			},
			async () => invokeContentEntry('/app/content/entry.mdx', 'react', component, page, {}),
		);

		expect(result.value).toBe('foreign-html');
	});

	test('defaults props when invoked without a props argument', async () => {
		const component = (() => 'content') as unknown as TestContentEntryComponent;
		const page = (props: Record<string, unknown>) => props;
		const interceptedProps: Record<string, unknown>[] = [];
		const result = await runWithComponentRenderContext(
			{
				currentIntegration: 'ecopages-jsx',
				foreignChildRuntime: {
					interceptForeignChild: async ({ props }) => {
						interceptedProps.push(props);
						return { kind: 'resolved', value: 'foreign-html' };
					},
				},
			},
			async () => invokeContentEntry('/app/content/entry.mdx', 'react', component, page),
		);

		expect(result.value).toBe('foreign-html');
		expect(interceptedProps).toEqual([{}]);
	});
});
