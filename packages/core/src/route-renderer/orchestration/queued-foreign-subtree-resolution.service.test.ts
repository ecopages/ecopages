import { describe, expect, it, vi } from 'vitest';
import { eco } from '../../eco/eco.ts';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type {
	BaseIntegrationContext,
	ForeignSubtreeRenderPayload,
	ComponentRenderInput,
	EcoComponent,
} from '../../types/public-types.ts';
import {
	QueuedForeignSubtreeResolutionService,
	type QueuedForeignSubtreeResolutionContext,
} from './queued-foreign-subtree-resolution.service.ts';

function createComponent(name: string, integration = name): EcoComponent<Record<string, unknown>, string> {
	return eco.component<Record<string, unknown>, string>({
		integration,
		render: () => `<div data-component="${name}"></div>`,
	});
}

function createAsset(content: string): ProcessedAsset {
	return {
		kind: 'script',
		inline: true,
		content,
		position: 'body',
	};
}

function dedupeAssets(assets: ProcessedAsset[]): ProcessedAsset[] {
	const seen = new Set<string>();
	const deduped: ProcessedAsset[] = [];

	for (const asset of assets) {
		const key = JSON.stringify(asset);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(asset);
	}

	return deduped;
}

function applyAttributesToFirstElement(html: string, attributes: Record<string, string>): string {
	const serializedAttributes = Object.entries(attributes)
		.map(([name, value]) => ` ${name}="${value}"`)
		.join('');

	return html.replace(/^<([a-zA-Z][a-zA-Z0-9:-]*)/, `<$1${serializedAttributes}`);
}

describe('QueuedForeignSubtreeResolutionService', () => {
	it('creates scoped queue tokens and stores runtime state on the render input', () => {
		const service = new QueuedForeignSubtreeResolutionService();
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

		const runtime = service.createRuntime({
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

		const runtimeContext = service.getRuntimeContext<QueuedForeignSubtreeResolutionContext>(
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

	it('preserves existing shared integration context fields when queue runtime state is attached', () => {
		const service = new QueuedForeignSubtreeResolutionService();
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

		service.createRuntime({
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

	it('resolves nested queued foreign subtrees, applies root attributes, and dedupes bubbled assets', async () => {
		const service = new QueuedForeignSubtreeResolutionService();
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

		const runtime = service.createRuntime({
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

		const runtimeContext = service.getRuntimeContext<QueuedForeignSubtreeResolutionContext>(
			renderInput,
			'__testQueuedForeignSubtreeRuntime',
		);
		if (!runtimeContext || parentToken?.kind !== 'resolved' || childToken?.kind !== 'resolved') {
			throw new Error('Failed to initialize queued foreign-subtree test runtime.');
		}

		runtimeContext.queuedResolutions[0].props.children = `<slot>${childToken.value}</slot>`;

		const resolveForeignSubtree = vi.fn(
			async (input: ComponentRenderInput): Promise<ForeignSubtreeRenderPayload> => {
				if (input.component === childForeignSubtree) {
					return {
						html: `<span>${String(input.props.label ?? '')}</span>`,
						attachmentPolicy: { kind: 'first-element' },
						rootTag: 'span',
						integrationName: 'deferred',
						rootAttributes: {
							'data-owner': 'child',
							'data-instance': String(
								(input.integrationContext as { componentInstanceId?: string } | undefined)
									?.componentInstanceId ?? 'missing',
							),
						},
						assets: [createAsset('shared-asset'), createAsset('child-asset')],
					};
				}

				return {
					html: `<section>${input.children ?? ''}</section>`,
					attachmentPolicy: { kind: 'first-element' },
					rootTag: 'section',
					integrationName: 'deferred',
					rootAttributes: {
						'data-owner': 'parent',
					},
					assets: [createAsset('shared-asset'), createAsset('parent-asset')],
				};
			},
		);

		const result = await service.resolveQueuedHtml({
			html: `<article>${parentToken.value}</article>`,
			runtimeContext,
			queueLabel: 'Test',
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
				if (children === undefined) {
					return { assets: [], html: undefined };
				}

				let html = typeof children === 'string' ? children : String(children ?? '');

				for (const token of queuedResolutionsByToken.keys()) {
					if (!html.includes(token)) {
						continue;
					}

					html = html.split(token).join(await resolveToken(token));
				}

				return {
					assets: [createAsset('shared-asset'), createAsset('children-asset')],
					html,
				};
			},
			resolveForeignSubtree,
			applyAttributesToFirstElement,
			dedupeProcessedAssets: dedupeAssets,
		});

		expect(result.html).toBe(
			'<article><section data-owner="parent"><slot><span data-owner="child" data-instance="host_n_2">child</span></slot></section></article>',
		);
		expect(result.assets).toEqual([
			createAsset('shared-asset'),
			createAsset('child-asset'),
			createAsset('children-asset'),
			createAsset('parent-asset'),
		]);
		expect(resolveForeignSubtree).toHaveBeenCalledTimes(2);
	});

	it('throws when queued foreign subtrees form a cycle', async () => {
		const service = new QueuedForeignSubtreeResolutionService();
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
			service.resolveQueuedHtml({
				html: `<article>__TEST_QUEUE__host__1__</article>`,
				runtimeContext,
				queueLabel: 'Test',
				renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
					if (children === undefined) {
						return { assets: [], html: undefined };
					}

					let html = typeof children === 'string' ? children : String(children ?? '');

					for (const token of queuedResolutionsByToken.keys()) {
						if (!html.includes(token)) {
							continue;
						}

						html = html.split(token).join(await resolveToken(token));
					}

					return { assets: [], html };
				},
				resolveForeignSubtree: async (input) => ({
					html: `<section>${input.children ?? ''}</section>`,
					assets: [],
					attachmentPolicy: { kind: 'first-element' },
					rootTag: 'section',
					integrationName: 'deferred',
				}),
				applyAttributesToFirstElement,
				dedupeProcessedAssets: dedupeAssets,
			}),
		).rejects.toThrow('contains a cycle or unresolved dependency links');
	});
});
