import { describe, expect, it, vi } from 'vitest';
import { eco } from '../../../eco/eco.ts';
import type {
	BaseIntegrationContext,
	ComponentRenderInput,
	EcoComponent,
	ComponentRenderResult,
} from '../../../types/contracts.ts';
import { getComponentRenderContext, runWithComponentRenderContext } from '../../../eco/component-render-context.ts';
import {
	createQueueRuntime,
	executeComponentRender,
	getRuntimeContext,
	resolveQueuedForeignSubtreeTokens,
	shouldDelegateForeignChild,
	type QueuedForeignSubtreeResolutionContext,
} from './foreign-subtree-execution.service.ts';

function createComponent(name: string, integration = name): EcoComponent<Record<string, unknown>, string> {
	return eco.component<Record<string, unknown>, string>({
		integration,
		render: () => `<div data-component="${name}"></div>`,
	});
}

describe('shouldDelegateForeignChild', () => {
	it.each([
		[
			'a different integration owns the boundary',
			{ currentIntegration: 'string', targetIntegration: 'react' },
			true,
		],
		['the same integration owns the boundary', { currentIntegration: 'react', targetIntegration: 'react' }, false],
		[
			'the boundary has no owning integration',
			{ currentIntegration: 'react', targetIntegration: undefined },
			false,
		],
	])('when %s', (_name, input, expected) => {
		expect(shouldDelegateForeignChild(input)).toBe(expected);
	});
});

describe('queued foreign-subtree resolution', () => {
	it('creates scoped queue tokens and stores runtime state on the render input', () => {
		const shell = createComponent('shell', 'shell');
		const deferredWidget = createComponent('deferred-widget', 'deferred');
		const renderInput: ComponentRenderInput = {
			component: shell,
			props: {},
			integrationContext: {
				componentInstanceId: 'host',
			},
		};
		const rendererCache = new Map<string, unknown>();
		const originalProps = { label: 'deferred' };

		const runtime = createQueueRuntime({
			renderInput,
			rendererCache,
			runtimeContextKey: '__testQueuedForeignSubtreeRuntime',
			tokenPrefix: '__TEST_QUEUE__',
			shouldQueueForeignChild: () => true,
		});

		const interception = runtime.interceptForeignChildSync?.({
			currentIntegration: 'shell',
			targetIntegration: 'deferred',
			component: deferredWidget,
			props: originalProps,
		});
		originalProps.label = 'mutated-after-queue';

		expect(interception).toEqual({
			kind: 'resolved',
			value: '__TEST_QUEUE__host__1__',
		});

		const runtimeContext = getRuntimeContext<QueuedForeignSubtreeResolutionContext>(
			renderInput,
			'__testQueuedForeignSubtreeRuntime',
		);

		expect(runtimeContext).toEqual({
			rendererCache,
			componentInstanceScope: 'host',
			nextForeignSubtreeId: 1,
			queuedResolutions: [
				{
					token: '__TEST_QUEUE__host__1__',
					component: deferredWidget,
					props: { label: 'deferred' },
					componentInstanceId: 'host_n_1',
				},
			],
		});
		expect(renderInput.integrationContext).toEqual(
			expect.objectContaining({
				rendererCache,
			}),
		);
	});

	it('rejects opaque foreign children when queuing instead of string-coercing them', () => {
		const shell = createComponent('shell', 'shell');
		const deferredWidget = createComponent('deferred-widget', 'deferred');
		const renderInput: ComponentRenderInput = {
			component: shell,
			props: {},
			integrationContext: {
				componentInstanceId: 'host',
			},
		};

		const runtime = createQueueRuntime({
			renderInput,
			rendererCache: new Map(),
			runtimeContextKey: '__testQueuedForeignSubtreeRuntime',
			tokenPrefix: '__TEST_QUEUE__',
			shouldQueueForeignChild: () => true,
		});

		expect(() =>
			runtime.interceptForeignChildSync?.({
				currentIntegration: 'shell',
				targetIntegration: 'deferred',
				component: deferredWidget,
				props: { children: { opaque: true } },
			}),
		).toThrow(/refused to coerce opaque foreign children/);
	});

	it('preserves existing shared integration context fields when queue runtime state is attached', () => {
		const shell = createComponent('shell', 'shell');
		const renderInput: ComponentRenderInput = {
			component: shell,
			props: {},
			integrationContext: {
				componentInstanceId: 'host',
				customKey: 'preserved',
			} as BaseIntegrationContext & { customKey: string },
		};
		const rendererCache = new Map<string, unknown>();

		createQueueRuntime({
			renderInput,
			rendererCache,
			runtimeContextKey: '__testQueuedForeignSubtreeRuntime',
			tokenPrefix: '__TEST_QUEUE__',
			shouldQueueForeignChild: () => true,
		});

		expect(renderInput.integrationContext).toEqual(
			expect.objectContaining({
				componentInstanceId: 'host',
				customKey: 'preserved',
				rendererCache,
			}),
		);
	});

	it('resolves nested queued foreign subtrees and applies root attributes', async () => {
		const shell = createComponent('shell', 'shell');
		const parentForeignSubtree = createComponent('parent-foreign-subtree', 'deferred');
		const childForeignSubtree = createComponent('child-foreign-subtree', 'deferred');
		const renderInput: ComponentRenderInput = {
			component: shell,
			props: {},
			integrationContext: {
				componentInstanceId: 'host',
			},
		};
		const rendererCache = new Map<string, unknown>();

		const runtime = createQueueRuntime({
			renderInput,
			rendererCache,
			runtimeContextKey: '__testQueuedForeignSubtreeRuntime',
			tokenPrefix: '__TEST_QUEUE__',
			shouldQueueForeignChild: () => true,
		});

		const parentToken = runtime.interceptForeignChildSync?.({
			currentIntegration: 'shell',
			targetIntegration: 'deferred',
			component: parentForeignSubtree,
			props: { label: 'parent' },
		});

		const childToken = runtime.interceptForeignChildSync?.({
			currentIntegration: 'shell',
			targetIntegration: 'deferred',
			component: childForeignSubtree,
			props: { label: 'child' },
		});

		const runtimeContext = getRuntimeContext<QueuedForeignSubtreeResolutionContext>(
			renderInput,
			'__testQueuedForeignSubtreeRuntime',
		);
		if (!runtimeContext || parentToken?.kind !== 'resolved' || childToken?.kind !== 'resolved') {
			throw new Error('Failed to initialize queued foreign-subtree test runtime.');
		}

		runtimeContext.queuedResolutions[0].props.children = `<slot>${childToken.value}</slot>`;

		const resolveForeignSubtree = vi.fn(async (input: ComponentRenderInput): Promise<ComponentRenderResult> => {
			if (input.component === childForeignSubtree) {
				return {
					html: `<span>${String(input.props.label ?? '')}</span>`,
					canAttachAttributes: true,
					integrationName: 'deferred',
					rootAttributes: {
						'data-owner': 'child',
						'data-instance': String(
							(input.integrationContext as { componentInstanceId?: string } | undefined)
								?.componentInstanceId ?? 'missing',
						),
					},
				};
			}

			return {
				html: `<section>${input.children ?? ''}</section>`,
				canAttachAttributes: true,
				integrationName: 'deferred',
				rootAttributes: {
					'data-owner': 'parent',
				},
			};
		});

		const result = await resolveQueuedForeignSubtreeTokens({
			html: `<article>${parentToken.value}</article>`,
			runtimeContext,
			queueLabel: 'Test',
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
				if (children === undefined) {
					return {};
				}

				let html = typeof children === 'string' ? children : String(children ?? '');

				for (const token of queuedResolutionsByToken.keys()) {
					if (!html.includes(token)) {
						continue;
					}

					html = html.split(token).join(await resolveToken(token));
				}

				return { html };
			},
			resolveForeignSubtree,
		});

		expect(result).toBe(
			'<article><section data-owner="parent"><slot><span data-owner="child" data-instance="host_n_2">child</span></slot></section></article>',
		);
		expect(resolveForeignSubtree).toHaveBeenCalledTimes(2);
	});

	it('throws when queued foreign subtrees form a cycle', async () => {
		const foreignSubtreeA = createComponent('foreign-subtree-a', 'deferred');
		const foreignSubtreeB = createComponent('foreign-subtree-b', 'deferred');
		const runtimeContext: QueuedForeignSubtreeResolutionContext = {
			rendererCache: new Map<string, unknown>(),
			componentInstanceScope: 'host',
			nextForeignSubtreeId: 2,
			queuedResolutions: [
				{
					token: '__TEST_QUEUE__host__1__',
					component: foreignSubtreeA,
					props: { children: '__TEST_QUEUE__host__2__' },
					componentInstanceId: 'host_n_1',
				},
				{
					token: '__TEST_QUEUE__host__2__',
					component: foreignSubtreeB,
					props: { children: '__TEST_QUEUE__host__1__' },
					componentInstanceId: 'host_n_2',
				},
			],
		};

		await expect(
			resolveQueuedForeignSubtreeTokens({
				html: `<article>__TEST_QUEUE__host__1__</article>`,
				runtimeContext,
				queueLabel: 'Test',
				renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
					if (children === undefined) {
						return {};
					}

					let html = typeof children === 'string' ? children : String(children ?? '');

					for (const token of queuedResolutionsByToken.keys()) {
						if (!html.includes(token)) {
							continue;
						}

						html = html.split(token).join(await resolveToken(token));
					}

					return { html };
				},
				resolveForeignSubtree: async (input) => ({
					html: `<section>${input.children ?? ''}</section>`,
					canAttachAttributes: true,
					integrationName: 'deferred',
				}),
			}),
		).rejects.toThrow('contains a cycle or unresolved dependency links');
	});

	it('passes structured queued children through to the owning renderer', async () => {
		const foreignSubtree = createComponent('foreign-subtree', 'deferred');
		const structuredChildren = { kind: 'structured-child' };
		const runtimeContext: QueuedForeignSubtreeResolutionContext = {
			rendererCache: new Map<string, unknown>(),
			componentInstanceScope: 'host',
			nextForeignSubtreeId: 1,
			queuedResolutions: [
				{
					token: '__TEST_QUEUE__host__1__',
					component: foreignSubtree,
					props: { children: structuredChildren },
					componentInstanceId: 'host_n_1',
				},
			],
		};

		const resolveForeignSubtree = vi.fn(async (input: ComponentRenderInput): Promise<ComponentRenderResult> => ({
			html: `<section>${JSON.stringify(input.children)}</section>`,
			canAttachAttributes: true,
			integrationName: 'deferred',
		}));

		const result = await resolveQueuedForeignSubtreeTokens({
			html: '<article>__TEST_QUEUE__host__1__</article>',
			runtimeContext,
			queueLabel: 'Test',
			renderQueuedChildren: async (children) => ({ children }),
			resolveForeignSubtree,
		});

		expect(result).toBe('<article><section>{"kind":"structured-child"}</section></article>');
		expect(resolveForeignSubtree).toHaveBeenCalledWith(
			expect.objectContaining({
				children: structuredChildren,
			}),
			expect.any(Map),
		);
	});

	it('resolves queued tokens appended while another token is resolving', async () => {
		const parentForeignSubtree = createComponent('parent-foreign-subtree', 'deferred');
		const childForeignSubtree = createComponent('child-foreign-subtree', 'deferred');
		const runtimeContext: QueuedForeignSubtreeResolutionContext = {
			rendererCache: new Map<string, unknown>(),
			componentInstanceScope: 'host',
			nextForeignSubtreeId: 1,
			queuedResolutions: [
				{
					token: '__TEST_QUEUE__host__1__',
					component: parentForeignSubtree,
					props: {},
					componentInstanceId: 'host_n_1',
				},
			],
		};

		const resolveForeignSubtree = vi.fn(async (input: ComponentRenderInput): Promise<ComponentRenderResult> => {
			if (input.component === parentForeignSubtree) {
				runtimeContext.queuedResolutions.push({
					token: '__TEST_QUEUE__host__2__',
					component: childForeignSubtree,
					props: {},
					componentInstanceId: 'host_n_2',
				});

				return {
					html: '<section>__TEST_QUEUE__host__2__</section>',
					canAttachAttributes: true,
					integrationName: 'deferred',
				};
			}

			return {
				html: '<strong>child</strong>',
				canAttachAttributes: true,
				integrationName: 'deferred',
			};
		});

		const result = await resolveQueuedForeignSubtreeTokens({
			html: '<article>__TEST_QUEUE__host__1__</article>',
			runtimeContext,
			queueLabel: 'Test',
			renderQueuedChildren: async () => ({}),
			resolveForeignSubtree,
		});

		expect(result).toBe('<article><section><strong>child</strong></section></article>');
		expect(resolveForeignSubtree).toHaveBeenCalledTimes(2);
	});
});

describe('executeComponentRender context', () => {
	it('names the current integration for a top-level component with no foreign children and restores context after render', async () => {
		const page = createComponent('page', 'react');
		let seenIntegration: string | undefined;

		expect(getComponentRenderContext()).toBeUndefined();

		const result = await executeComponentRender({
			currentIntegrationName: 'react',
			input: { component: page, props: {} },
			renderComponent: async () => {
				seenIntegration = getComponentRenderContext()?.currentIntegration;
				return {
					html: '<div data-component="page"></div>',
					canAttachAttributes: true,
					integrationName: 'react',
				};
			},
			normalizeComponentRenderOutput: (output) => output,
			hasForeignChildDescendants: () => false,
			createForeignChildRuntime: () => {
				throw new Error('foreign-child runtime should not be created');
			},
			getOwningRenderer: async () => {
				throw new Error('owning renderer should not be resolved');
			},
		});

		expect(seenIntegration).toBe('react');
		expect(getComponentRenderContext()).toBeUndefined();
		expect(result.html).toBe('<div data-component="page"></div>');

		await runWithComponentRenderContext({ currentIntegration: 'ecopages-jsx' }, async () => {
			let nestedIntegration: string | undefined;

			await executeComponentRender({
				currentIntegrationName: 'react',
				input: { component: page, props: {} },
				renderComponent: async () => {
					nestedIntegration = getComponentRenderContext()?.currentIntegration;
					return {
						html: '<div data-component="page"></div>',
						canAttachAttributes: true,
						integrationName: 'react',
					};
				},
				normalizeComponentRenderOutput: (output) => output,
				hasForeignChildDescendants: () => false,
				createForeignChildRuntime: () => {
					throw new Error('foreign-child runtime should not be created');
				},
				getOwningRenderer: async () => {
					throw new Error('owning renderer should not be resolved');
				},
			});

			expect(nestedIntegration).toBe('react');
			expect(getComponentRenderContext()?.currentIntegration).toBe('ecopages-jsx');
		});

		expect(getComponentRenderContext()).toBeUndefined();
	});
});
