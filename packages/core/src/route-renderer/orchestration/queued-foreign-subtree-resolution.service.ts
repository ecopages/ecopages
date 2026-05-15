import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type {
	BaseIntegrationContext,
	ForeignSubtreeRenderPayload,
	ComponentRenderInput,
	EcoComponent,
} from '../../types/public-types.ts';
import type { ForeignChildRuntime } from './component-render-context.ts';

export type QueuedForeignChildDecisionInput = {
	currentIntegration: string;
	targetIntegration?: string;
	component: EcoComponent;
	props: Record<string, unknown>;
};

export type QueuedForeignSubtreeResolution = {
	token: string;
	component: EcoComponent;
	props: Record<string, unknown>;
	componentInstanceId: string;
};

/**
 * Shared mutable state for one renderer-owned queued foreign-subtree runtime.
 *
 * Renderers that cannot resolve foreign children inline can enqueue transport
 * tokens during their initial render, then resolve those tokens against the
 * owning renderer before returning final HTML.
 */
export type QueuedForeignSubtreeResolutionContext = {
	rendererCache: Map<string, unknown>;
	componentInstanceScope?: string;
	nextForeignSubtreeId: number;
	queuedResolutions: QueuedForeignSubtreeResolution[];
};

type QueuedForeignSubtreeIntegrationContext = BaseIntegrationContext & Record<string, unknown>;

type QueuedForeignSubtreeChildRenderResult = {
	assets: ProcessedAsset[];
	html?: string;
	children?: unknown;
};

/**
 * Lower-level queue orchestration for renderer-owned foreign-child runtimes that emit
 * temporary transport tokens during one render pass.
 *
 * The service keeps three responsibilities in one place:
 * - storing per-render queue state on the active integration context
 * - creating a `ForeignChildRuntime` that enqueues foreign children
 * - resolving queued tokens back through the owning renderer before final HTML
 *   leaves the current renderer
 *
 * The deeper Foreign Subtree execution module composes this queue helper with
 * renderer-cache delegation and active render-context execution. This service
 * stays focused on queue bookkeeping, recursion, cycle detection, and asset merging.
 */
export class QueuedForeignSubtreeResolutionService {
	/**
	 * Reads the queued foreign-subtree runtime state previously attached to one render.
	 */
	getRuntimeContext<TContext extends QueuedForeignSubtreeResolutionContext>(
		input: ComponentRenderInput,
		runtimeContextKey: string,
	): TContext | undefined {
		const integrationContext = input.integrationContext as QueuedForeignSubtreeIntegrationContext | undefined;
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
	 * When the renderer decides a foreign child must be handed off, the runtime returns
	 * a resolved transport token instead of rendering the foreign component inline.
	 */
	createRuntime<TContext extends QueuedForeignSubtreeResolutionContext>(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, unknown>;
		runtimeContextKey: string;
		tokenPrefix: string;
		shouldQueueForeignChild: (input: QueuedForeignChildDecisionInput) => boolean;
		createRuntimeContext?: (
			integrationContext: QueuedForeignSubtreeIntegrationContext,
			rendererCache: Map<string, unknown>,
		) => TContext;
	}): ForeignChildRuntime {
		const runtimeContext = this.ensureRuntimeContext(options);

		const interceptForeignChild = (input: QueuedForeignChildDecisionInput) => {
			if (!options.shouldQueueForeignChild(input)) {
				return {
					kind: 'inline' as const,
					props: { ...input.props },
				};
			}

			runtimeContext.nextForeignSubtreeId += 1;
			const foreignSubtreeId = runtimeContext.nextForeignSubtreeId;
			const token = this.createForeignSubtreeToken(options.tokenPrefix, runtimeContext, foreignSubtreeId);
			runtimeContext.queuedResolutions.push({
				token,
				component: input.component,
				props: { ...input.props },
				componentInstanceId: runtimeContext.componentInstanceScope
					? `${runtimeContext.componentInstanceScope}_n_${foreignSubtreeId}`
					: `n_${foreignSubtreeId}`,
			});

			return {
				kind: 'resolved' as const,
				value: token,
			};
		};

		return {
			interceptForeignChild,
			interceptForeignChildSync: interceptForeignChild,
		};
	}

	/**
	 * Resolves every queued transport token in one renderer-owned HTML fragment.
	 *
	 * The caller supplies framework-specific child rendering, while this service
	 * handles recursive token replacement, cycle detection, root-attribute
	 * application, and merged asset collection.
	 */
	async resolveQueuedHtml<TContext extends QueuedForeignSubtreeResolutionContext>(options: {
		html: string;
		runtimeContext?: TContext;
		queueLabel: string;
		renderQueuedChildren: (
			children: unknown,
			runtimeContext: TContext,
			queuedResolutionsByToken: Map<string, QueuedForeignSubtreeResolution>,
			resolveToken: (token: string) => Promise<string>,
		) => Promise<QueuedForeignSubtreeChildRenderResult>;
		resolveForeignSubtree: (
			input: ComponentRenderInput,
			rendererCache: Map<string, unknown>,
		) => Promise<ForeignSubtreeRenderPayload | undefined>;
		applyAttributesToFirstElement: (html: string, attributes: Record<string, string>) => string;
		dedupeProcessedAssets: (assets: ProcessedAsset[]) => ProcessedAsset[];
	}): Promise<{ assets: ProcessedAsset[]; html: string }> {
		if (!options.runtimeContext || options.runtimeContext.queuedResolutions.length === 0) {
			return { assets: [], html: options.html };
		}

		const runtimeContext = options.runtimeContext;
		const queuedResolutionsByToken = new Map<string, QueuedForeignSubtreeResolution>();
		const resolvedHtmlByToken = new Map<string, string>();
		const resolvingTokens = new Set<string>();
		const collectedAssets: ProcessedAsset[] = [];

		const syncQueuedResolutions = () => {
			for (const resolution of runtimeContext.queuedResolutions) {
				if (!queuedResolutionsByToken.has(resolution.token)) {
					queuedResolutionsByToken.set(resolution.token, resolution);
				}
			}
		};

		const resolveToken = async (token: string): Promise<string> => {
			syncQueuedResolutions();

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
					`[ecopages] ${options.queueLabel} foreign-subtree queue contains a cycle or unresolved dependency links.`,
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
				syncQueuedResolutions();

				if (renderedChildren.assets.length > 0) {
					collectedAssets.push(...renderedChildren.assets);
				}

				const foreignSubtreeRender = await options.resolveForeignSubtree(
					{
						component: resolution.component,
						props: { ...resolution.props },
						children: renderedChildren.html ?? renderedChildren.children,
						integrationContext: {
							rendererCache: runtimeContext.rendererCache,
							componentInstanceId: resolution.componentInstanceId,
						},
					},
					runtimeContext.rendererCache,
				);

				if (!foreignSubtreeRender) {
					throw new Error(
						`[ecopages] ${options.queueLabel} queued foreign subtree could not resolve its owning renderer.`,
					);
				}

				if ((foreignSubtreeRender.assets?.length ?? 0) > 0) {
					collectedAssets.push(...(foreignSubtreeRender.assets ?? []));
				}

				const resolvedHtml =
					foreignSubtreeRender.attachmentPolicy.kind === 'first-element' &&
					foreignSubtreeRender.rootAttributes
						? options.applyAttributesToFirstElement(
								foreignSubtreeRender.html,
								foreignSubtreeRender.rootAttributes,
							)
						: foreignSubtreeRender.html;

				resolvedHtmlByToken.set(token, resolvedHtml);
				return resolvedHtml;
			} finally {
				resolvingTokens.delete(token);
			}
		};

		let resolvedHtml = options.html;

		for (let index = 0; index < runtimeContext.queuedResolutions.length; index += 1) {
			syncQueuedResolutions();

			const resolution = runtimeContext.queuedResolutions[index];
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

	private createForeignSubtreeToken(
		tokenPrefix: string,
		runtimeContext: QueuedForeignSubtreeResolutionContext,
		foreignSubtreeId: number,
	): string {
		return `${tokenPrefix}${runtimeContext.componentInstanceScope ?? 'root'}__${foreignSubtreeId}__`;
	}

	private ensureRuntimeContext<TContext extends QueuedForeignSubtreeResolutionContext>(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, unknown>;
		runtimeContextKey: string;
		createRuntimeContext?: (
			integrationContext: QueuedForeignSubtreeIntegrationContext,
			rendererCache: Map<string, unknown>,
		) => TContext;
	}): TContext {
		let integrationContext: QueuedForeignSubtreeIntegrationContext;
		if (
			typeof options.renderInput.integrationContext === 'object' &&
			options.renderInput.integrationContext !== null
		) {
			integrationContext = options.renderInput.integrationContext as QueuedForeignSubtreeIntegrationContext;
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
					nextForeignSubtreeId: 0,
					queuedResolutions: [],
				} satisfies QueuedForeignSubtreeResolutionContext);
		} else {
			(existingRuntimeContext as QueuedForeignSubtreeResolutionContext).rendererCache = options.rendererCache;
		}

		integrationContext.rendererCache = options.rendererCache;
		options.renderInput.integrationContext = integrationContext;

		return integrationContext[options.runtimeContextKey] as TContext;
	}
}
