import { describe, expect, it, vi } from 'vitest';
import { eco } from '../../eco/eco.ts';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type {
	BaseIntegrationContext,
	BoundaryRenderPayload,
	ComponentRenderInput,
	EcoComponent,
} from '../../types/public-types.ts';
import { QueuedBoundaryRuntimeService, type QueuedBoundaryRuntimeContext } from './queued-boundary-runtime.service.ts';

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

describe('QueuedBoundaryRuntimeService', () => {
	it('creates scoped queue tokens and stores runtime state on the boundary input', () => {
		const service = new QueuedBoundaryRuntimeService();
		const shell = createComponent('shell', 'shell');
		const deferredWidget = createComponent('deferred-widget', 'deferred');
		const boundaryInput: ComponentRenderInput = {
			component: shell,
			props: {},
			integrationContext: {
				componentInstanceId: 'host',
			},
		};
		const rendererCache = new Map<string, unknown>();
		const originalProps = { label: 'deferred' };

		const runtime = service.createRuntime({
			boundaryInput,
			rendererCache,
			runtimeContextKey: '__testQueuedBoundaryRuntime',
			tokenPrefix: '__TEST_QUEUE__',
			shouldQueueBoundary: () => true,
		});

		const interception = runtime.interceptBoundarySync?.({
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

		const runtimeContext = service.getRuntimeContext<QueuedBoundaryRuntimeContext>(
			boundaryInput,
			'__testQueuedBoundaryRuntime',
		);

		expect(runtimeContext).toEqual({
			rendererCache,
			componentInstanceScope: 'host',
			nextBoundaryId: 1,
			queuedResolutions: [
				{
					token: '__TEST_QUEUE__host__1__',
					component: deferredWidget,
					props: { label: 'deferred' },
					componentInstanceId: 'host_n_1',
				},
			],
		});
		expect(boundaryInput.integrationContext).toEqual(
			expect.objectContaining({
				rendererCache,
			}),
		);
	});

	it('preserves existing shared integration context fields when queue runtime state is attached', () => {
		const service = new QueuedBoundaryRuntimeService();
		const shell = createComponent('shell', 'shell');
		const boundaryInput: ComponentRenderInput = {
			component: shell,
			props: {},
			integrationContext: {
				componentInstanceId: 'host',
				customKey: 'preserved',
			} as BaseIntegrationContext & { customKey: string },
		};
		const rendererCache = new Map<string, unknown>();

		service.createRuntime({
			boundaryInput,
			rendererCache,
			runtimeContextKey: '__testQueuedBoundaryRuntime',
			tokenPrefix: '__TEST_QUEUE__',
			shouldQueueBoundary: () => true,
		});

		expect(boundaryInput.integrationContext).toEqual(
			expect.objectContaining({
				componentInstanceId: 'host',
				customKey: 'preserved',
				rendererCache,
			}),
		);
	});

	it('resolves nested queued boundaries, applies root attributes, and dedupes bubbled assets', async () => {
		const service = new QueuedBoundaryRuntimeService();
		const shell = createComponent('shell', 'shell');
		const parentBoundary = createComponent('parent-boundary', 'deferred');
		const childBoundary = createComponent('child-boundary', 'deferred');
		const boundaryInput: ComponentRenderInput = {
			component: shell,
			props: {},
			integrationContext: {
				componentInstanceId: 'host',
			},
		};
		const rendererCache = new Map<string, unknown>();

		const runtime = service.createRuntime({
			boundaryInput,
			rendererCache,
			runtimeContextKey: '__testQueuedBoundaryRuntime',
			tokenPrefix: '__TEST_QUEUE__',
			shouldQueueBoundary: () => true,
		});

		const parentToken = runtime.interceptBoundarySync?.({
			currentIntegration: 'shell',
			targetIntegration: 'deferred',
			component: parentBoundary,
			props: { label: 'parent' },
		});

		const childToken = runtime.interceptBoundarySync?.({
			currentIntegration: 'shell',
			targetIntegration: 'deferred',
			component: childBoundary,
			props: { label: 'child' },
		});

		const runtimeContext = service.getRuntimeContext<QueuedBoundaryRuntimeContext>(
			boundaryInput,
			'__testQueuedBoundaryRuntime',
		);
		if (!runtimeContext || parentToken?.kind !== 'resolved' || childToken?.kind !== 'resolved') {
			throw new Error('Failed to initialize queued boundary test runtime.');
		}

		runtimeContext.queuedResolutions[0].props.children = `<slot>${childToken.value}</slot>`;

		const resolveBoundary = vi.fn(async (input: ComponentRenderInput): Promise<BoundaryRenderPayload> => {
			if (input.component === childBoundary) {
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
		});

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
			resolveBoundary,
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
		expect(resolveBoundary).toHaveBeenCalledTimes(2);
	});

	it('throws when queued boundaries form a cycle', async () => {
		const service = new QueuedBoundaryRuntimeService();
		const boundaryA = createComponent('boundary-a', 'deferred');
		const boundaryB = createComponent('boundary-b', 'deferred');
		const runtimeContext: QueuedBoundaryRuntimeContext = {
			rendererCache: new Map<string, unknown>(),
			componentInstanceScope: 'host',
			nextBoundaryId: 2,
			queuedResolutions: [
				{
					token: '__TEST_QUEUE__host__1__',
					component: boundaryA,
					props: { children: '__TEST_QUEUE__host__2__' },
					componentInstanceId: 'host_n_1',
				},
				{
					token: '__TEST_QUEUE__host__2__',
					component: boundaryB,
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
				resolveBoundary: async (input) => ({
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
