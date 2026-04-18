import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type {
	BaseIntegrationContext,
	BoundaryRenderPayload,
	ComponentRenderInput,
	EcoComponent,
} from '../../types/public-types.ts';
import type { ComponentBoundaryRuntime } from './component-render-context.ts';

export type QueuedBoundaryDecisionInput = {
	currentIntegration: string;
	targetIntegration?: string;
	component: EcoComponent;
	props: Record<string, unknown>;
};

export type QueuedBoundaryResolution = {
	token: string;
	component: EcoComponent;
	props: Record<string, unknown>;
	componentInstanceId: string;
};

/**
 * Shared mutable state for one renderer-owned queued boundary runtime.
 *
 * Renderers that cannot resolve foreign boundaries inline can enqueue transport
 * tokens during their initial render, then resolve those tokens against the
 * owning renderer before returning final HTML.
 */
export type QueuedBoundaryRuntimeContext = {
	rendererCache: Map<string, unknown>;
	componentInstanceScope?: string;
	nextBoundaryId: number;
	queuedResolutions: QueuedBoundaryResolution[];
};

type QueuedBoundaryIntegrationContext = BaseIntegrationContext & Record<string, unknown>;

type QueuedBoundaryChildRenderResult = {
	assets: ProcessedAsset[];
	html?: string;
};

/**
 * Shared queue orchestration for renderer-owned boundary runtimes that emit
 * temporary transport tokens during one render pass.
 *
 * The service keeps three responsibilities in one place:
 * - storing per-render queue state on the active integration context
 * - creating a `ComponentBoundaryRuntime` that enqueues foreign boundaries
 * - resolving queued tokens back through the owning renderer before final HTML
 *   leaves the current renderer
 *
 * Renderers still own framework-specific child rendering. This service only
 * handles queue bookkeeping, recursion, cycle detection, and asset merging.
 */
export class QueuedBoundaryRuntimeService {
	/**
	 * Reads the queued boundary runtime state previously attached to one render.
	 */
	getRuntimeContext<TContext extends QueuedBoundaryRuntimeContext>(
		input: ComponentRenderInput,
		runtimeContextKey: string,
	): TContext | undefined {
		const integrationContext = input.integrationContext as QueuedBoundaryIntegrationContext | undefined;
		const runtimeContext = integrationContext?.[runtimeContextKey];

		if (typeof runtimeContext !== 'object' || runtimeContext === null) {
			return undefined;
		}

		return runtimeContext as TContext;
	}

	/**
	 * Creates the runtime hook used by `runWithComponentRenderContext()` for one
	 * renderer-owned queue.
	 *
	 * When the renderer decides a boundary must be handed off, the runtime returns
	 * a resolved transport token instead of rendering the foreign component inline.
	 */
	createRuntime<TContext extends QueuedBoundaryRuntimeContext>(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, unknown>;
		runtimeContextKey: string;
		tokenPrefix: string;
		shouldQueueBoundary: (input: QueuedBoundaryDecisionInput) => boolean;
		createRuntimeContext?: (
			integrationContext: QueuedBoundaryIntegrationContext,
			rendererCache: Map<string, unknown>,
		) => TContext;
	}): ComponentBoundaryRuntime {
		const runtimeContext = this.ensureRuntimeContext(options);

		const interceptBoundary = (input: QueuedBoundaryDecisionInput) => {
			if (!options.shouldQueueBoundary(input)) {
				return { kind: 'inline' as const };
			}

			runtimeContext.nextBoundaryId += 1;
			const boundaryId = runtimeContext.nextBoundaryId;
			const token = this.createBoundaryToken(options.tokenPrefix, runtimeContext, boundaryId);
			runtimeContext.queuedResolutions.push({
				token,
				component: input.component,
				props: { ...input.props },
				componentInstanceId: runtimeContext.componentInstanceScope
					? `${runtimeContext.componentInstanceScope}_n_${boundaryId}`
					: `n_${boundaryId}`,
			});

			return {
				kind: 'resolved' as const,
				value: token,
			};
		};

		return {
			interceptBoundary,
			interceptBoundarySync: interceptBoundary,
		};
	}

	/**
	 * Resolves every queued transport token in one renderer-owned HTML fragment.
	 *
	 * The caller supplies framework-specific child rendering, while this service
	 * handles recursive token replacement, cycle detection, root-attribute
	 * application, and merged asset collection.
	 */
	async resolveQueuedHtml<TContext extends QueuedBoundaryRuntimeContext>(options: {
		html: string;
		runtimeContext?: TContext;
		queueLabel: string;
		renderQueuedChildren: (
			children: unknown,
			runtimeContext: TContext,
			queuedResolutionsByToken: Map<string, QueuedBoundaryResolution>,
			resolveToken: (token: string) => Promise<string>,
		) => Promise<QueuedBoundaryChildRenderResult>;
		resolveBoundary: (
			input: ComponentRenderInput,
			rendererCache: Map<string, unknown>,
		) => Promise<BoundaryRenderPayload | undefined>;
		applyAttributesToFirstElement: (html: string, attributes: Record<string, string>) => string;
		dedupeProcessedAssets: (assets: ProcessedAsset[]) => ProcessedAsset[];
	}): Promise<{ assets: ProcessedAsset[]; html: string }> {
		if (!options.runtimeContext || options.runtimeContext.queuedResolutions.length === 0) {
			return { assets: [], html: options.html };
		}

		const runtimeContext = options.runtimeContext;
		const queuedResolutionsByToken = new Map(
			runtimeContext.queuedResolutions.map((resolution) => [resolution.token, resolution]),
		);
		const resolvedHtmlByToken = new Map<string, string>();
		const resolvingTokens = new Set<string>();
		const collectedAssets: ProcessedAsset[] = [];

		const resolveToken = async (token: string): Promise<string> => {
			const cachedHtml = resolvedHtmlByToken.get(token);
			if (cachedHtml) {
				return cachedHtml;
			}

			const resolution = queuedResolutionsByToken.get(token);
			if (!resolution) {
				return token;
			}

			if (resolvingTokens.has(token)) {
				throw new Error(
					`[ecopages] ${options.queueLabel} boundary queue contains a cycle or unresolved dependency links.`,
				);
			}

			resolvingTokens.add(token);

			try {
				const renderedChildren = await options.renderQueuedChildren(
					resolution.props.children,
					runtimeContext,
					queuedResolutionsByToken,
					resolveToken,
				);

				if (renderedChildren.assets.length > 0) {
					collectedAssets.push(...renderedChildren.assets);
				}

				const boundaryRender = await options.resolveBoundary(
					{
						component: resolution.component,
						props: { ...resolution.props },
						children: renderedChildren.html,
						integrationContext: {
							rendererCache: runtimeContext.rendererCache,
							componentInstanceId: resolution.componentInstanceId,
						},
					},
					runtimeContext.rendererCache,
				);

				if (!boundaryRender) {
					throw new Error(
						`[ecopages] ${options.queueLabel} queued boundary could not resolve its owning renderer.`,
					);
				}

				if ((boundaryRender.assets?.length ?? 0) > 0) {
					collectedAssets.push(...(boundaryRender.assets ?? []));
				}

				const resolvedHtml =
					boundaryRender.attachmentPolicy.kind === 'first-element' && boundaryRender.rootAttributes
						? options.applyAttributesToFirstElement(boundaryRender.html, boundaryRender.rootAttributes)
						: boundaryRender.html;

				resolvedHtmlByToken.set(token, resolvedHtml);
				return resolvedHtml;
			} finally {
				resolvingTokens.delete(token);
			}
		};

		let resolvedHtml = options.html;

		for (const resolution of runtimeContext.queuedResolutions) {
			if (!resolvedHtml.includes(resolution.token)) {
				continue;
			}

			resolvedHtml = resolvedHtml.split(resolution.token).join(await resolveToken(resolution.token));
		}

		return {
			assets: options.dedupeProcessedAssets(collectedAssets),
			html: resolvedHtml,
		};
	}

	private createBoundaryToken(
		tokenPrefix: string,
		runtimeContext: QueuedBoundaryRuntimeContext,
		boundaryId: number,
	): string {
		return `${tokenPrefix}${runtimeContext.componentInstanceScope ?? 'root'}__${boundaryId}__`;
	}

	private ensureRuntimeContext<TContext extends QueuedBoundaryRuntimeContext>(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, unknown>;
		runtimeContextKey: string;
		createRuntimeContext?: (
			integrationContext: QueuedBoundaryIntegrationContext,
			rendererCache: Map<string, unknown>,
		) => TContext;
	}): TContext {
		let integrationContext: QueuedBoundaryIntegrationContext;
		if (
			typeof options.boundaryInput.integrationContext === 'object' &&
			options.boundaryInput.integrationContext !== null
		) {
			integrationContext = options.boundaryInput.integrationContext as QueuedBoundaryIntegrationContext;
		} else {
			integrationContext = {};
		}

		const existingRuntimeContext = integrationContext[options.runtimeContextKey];
		if (typeof existingRuntimeContext !== 'object' || existingRuntimeContext === null) {
			integrationContext[options.runtimeContextKey] =
				options.createRuntimeContext?.(integrationContext, options.rendererCache) ??
				({
					rendererCache: options.rendererCache,
					componentInstanceScope: integrationContext.componentInstanceId,
					nextBoundaryId: 0,
					queuedResolutions: [],
				} satisfies QueuedBoundaryRuntimeContext);
		} else {
			(existingRuntimeContext as QueuedBoundaryRuntimeContext).rendererCache = options.rendererCache;
		}

		integrationContext.rendererCache = options.rendererCache;
		options.boundaryInput.integrationContext = integrationContext;

		return integrationContext[options.runtimeContextKey] as TContext;
	}
}
