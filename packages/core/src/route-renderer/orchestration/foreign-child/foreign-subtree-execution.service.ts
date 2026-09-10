import type { ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import type {
	BaseIntegrationContext,
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	ForeignSubtreeRenderPayload,
} from '../../../types/public-types.ts';
import {
	getComponentRenderContext,
	runWithComponentRenderContext,
	type ForeignChildRuntime,
} from './component-render-context.ts';
import { assertForeignChildrenNotOpaque, isMarkupNodeLike } from './foreign-child-output.utils.ts';

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

export interface ForeignSubtreeExecutionOwningRenderer {
	readonly name: string;
	renderComponentWithForeignChildren(input: ComponentRenderInput): Promise<ComponentRenderResult>;
}

export interface ForeignSubtreeExecutionDecisionInput {
	currentIntegration: string;
	targetIntegration?: string;
}

export interface ForeignSubtreeExecutionRenderOptions {
	currentIntegrationName: string;
	input: ComponentRenderInput;
	renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult>;
	normalizeComponentRenderOutput(result: ComponentRenderResult): ComponentRenderResult;
	hasForeignChildDescendants(component: EcoComponent): boolean;
	createForeignChildRuntime(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>;
	}): ForeignChildRuntime;
	getOwningRenderer(
		integrationName: string,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): Promise<ForeignSubtreeExecutionOwningRenderer>;
}

export interface ForeignSubtreeQueuedRuntimeOptions<TContext extends QueuedForeignSubtreeResolutionContext> {
	renderInput: ComponentRenderInput;
	rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>;
	runtimeContextKey: string;
	tokenPrefix: string;
	createRuntimeContext?: (
		integrationContext: BaseIntegrationContext & Record<string, unknown>,
		rendererCache: Map<string, unknown>,
	) => TContext;
}

export interface ForeignSubtreeStringQueuedHtmlOptions {
	currentIntegrationName: string;
	renderInput: ComponentRenderInput;
	html: string;
	runtimeContextKey: string;
	queueLabel: string;
	getOwningRenderer(
		integrationName: string,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): Promise<ForeignSubtreeExecutionOwningRenderer>;
	applyAttributesToFirstElement(html: string, attributes: Record<string, string>): string;
	dedupeProcessedAssets(assets: ProcessedAsset[]): ProcessedAsset[];
}

export interface ForeignSubtreeQueuedHtmlOptions<TContext extends QueuedForeignSubtreeResolutionContext> {
	currentIntegrationName: string;
	html: string;
	runtimeContext?: TContext;
	queueLabel: string;
	renderQueuedChildren(
		children: unknown,
		runtimeContext: TContext,
		queuedResolutionsByToken: Map<string, QueuedForeignSubtreeResolution>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<{ assets: ProcessedAsset[]; children?: unknown; html?: string }>;
	getOwningRenderer(
		integrationName: string,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): Promise<ForeignSubtreeExecutionOwningRenderer>;
	applyAttributesToFirstElement(html: string, attributes: Record<string, string>): string;
	dedupeProcessedAssets(assets: ProcessedAsset[]): ProcessedAsset[];
}

export interface ResolveQueuedForeignSubtreeTokensOptions<TContext extends QueuedForeignSubtreeResolutionContext> {
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
}

/**
 * Maps one component render result into the foreign-subtree payload shape used by
 * queue resolution and integration tests.
 */
export function toForeignSubtreeRenderPayload(result: ComponentRenderResult): ForeignSubtreeRenderPayload {
	return {
		html: result.html,
		assets: result.assets ?? [],
		rootTag: result.rootTag,
		rootAttributes: result.rootAttributes,
		attachmentPolicy: result.canAttachAttributes ? { kind: 'first-element' } : { kind: 'none' },
		integrationName: result.integrationName,
	};
}

/**
 * Executes one component render tree under Foreign Child support.
 *
 * This service owns mixed-integration execution policy and the queued token
 * mechanics renderers use when foreign children cannot resolve inline.
 */
export class ForeignSubtreeExecutionService {
	private requiresForeignChildRuntime(input: ComponentRenderInput): boolean {
		const children = input.children ?? input.props.children;

		if (children === undefined || children === null) {
			return false;
		}

		if (typeof children === 'string') {
			return false;
		}

		if (typeof children !== 'object') {
			return false;
		}

		return !isMarkupNodeLike(children);
	}

	shouldDelegateForeignChild(input: ForeignSubtreeExecutionDecisionInput): boolean {
		return !!input.targetIntegration && input.targetIntegration !== input.currentIntegration;
	}

	createFailFastRuntime(rendererName: string): ForeignChildRuntime {
		const interceptForeignChild = (input: ForeignSubtreeExecutionDecisionInput) => {
			if (!this.shouldDelegateForeignChild(input)) {
				return {
					kind: 'inline' as const,
					props: 'props' in input && input.props ? { ...input.props } : undefined,
				};
			}

			throw new Error(
				`[ecopages] ${rendererName} renderer crossed into ${input.targetIntegration} without a renderer-owned foreign-child runtime. Override createForeignChildRuntime() to resolve foreign children inside the owning renderer.`,
			);
		};

		return {
			interceptForeignChild,
			interceptForeignChildSync: interceptForeignChild,
		};
	}

	getQueuedRuntimeContext<TContext extends QueuedForeignSubtreeResolutionContext>(
		input: ComponentRenderInput,
		runtimeContextKey: string,
	): TContext | undefined {
		return this.getRuntimeContext<TContext>(input, runtimeContextKey);
	}

	createQueuedRuntime<TContext extends QueuedForeignSubtreeResolutionContext>(
		options: ForeignSubtreeQueuedRuntimeOptions<TContext>,
	): ForeignChildRuntime {
		return this.createQueueRuntime<TContext>({
			renderInput: options.renderInput,
			rendererCache: options.rendererCache as Map<string, unknown>,
			runtimeContextKey: options.runtimeContextKey,
			tokenPrefix: options.tokenPrefix,
			shouldQueueForeignChild: (input) => this.shouldDelegateForeignChild(input),
			createRuntimeContext: options.createRuntimeContext,
		});
	}

	createQueueRuntime<TContext extends QueuedForeignSubtreeResolutionContext>(options: {
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

			if ('children' in input.props) {
				assertForeignChildrenNotOpaque(input.props.children, 'foreign-subtree queue');
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

	async resolveStringQueuedHtml<TContext extends QueuedForeignSubtreeResolutionContext>(
		options: ForeignSubtreeStringQueuedHtmlOptions,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		const runtimeContext = this.getQueuedRuntimeContext<TContext>(options.renderInput, options.runtimeContextKey);

		return this.resolveQueuedHtml({
			currentIntegrationName: options.currentIntegrationName,
			html: options.html,
			runtimeContext,
			queueLabel: options.queueLabel,
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
				if (children === undefined) {
					return { assets: [], html: undefined };
				}

				if (typeof children !== 'string' && !isMarkupNodeLike(children)) {
					assertForeignChildrenNotOpaque(children, options.queueLabel);
					return { assets: [], children };
				}

				const html = await this.resolveQueuedTokens(
					typeof children === 'string' ? children : (children.outerHTML ?? ''),
					queuedResolutionsByToken,
					resolveToken,
				);

				return { assets: [], html };
			},
			getOwningRenderer: options.getOwningRenderer,
			applyAttributesToFirstElement: options.applyAttributesToFirstElement,
			dedupeProcessedAssets: options.dedupeProcessedAssets,
		});
	}

	async resolveQueuedHtml<TContext extends QueuedForeignSubtreeResolutionContext>(
		options: ForeignSubtreeQueuedHtmlOptions<TContext>,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.resolveQueuedForeignSubtreeTokens({
			html: options.html,
			runtimeContext: options.runtimeContext,
			queueLabel: options.queueLabel,
			renderQueuedChildren: options.renderQueuedChildren,
			resolveForeignSubtree: (input, rendererCache) =>
				this.resolveForeignSubtreeInOwningRenderer({
					currentIntegrationName: options.currentIntegrationName,
					input,
					rendererCache: rendererCache as Map<string, ForeignSubtreeExecutionOwningRenderer>,
					getOwningRenderer: options.getOwningRenderer,
				}),
			applyAttributesToFirstElement: options.applyAttributesToFirstElement,
			dedupeProcessedAssets: options.dedupeProcessedAssets,
		});
	}

	async resolveQueuedForeignSubtreeTokens<TContext extends QueuedForeignSubtreeResolutionContext>(
		options: ResolveQueuedForeignSubtreeTokensOptions<TContext>,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
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

	/**
	 * Runs one component render under the current integration's render context and
	 * resolves any queued foreign subtrees captured during that render.
	 *
	 * @remarks
	 * Component renders always execute under a context that names the rendering
	 * integration, even when no foreign-child runtime is installed.
	 */
	async executeComponentRender(options: ForeignSubtreeExecutionRenderOptions): Promise<ComponentRenderResult> {
		const rendererCache =
			this.getRendererCache(options.input.integrationContext) ??
			new Map<string, ForeignSubtreeExecutionOwningRenderer>();
		const delegatedForeignChildRender = await this.resolveForeignChildInOwningRenderer({
			currentIntegrationName: options.currentIntegrationName,
			input: options.input,
			rendererCache,
			getOwningRenderer: options.getOwningRenderer,
		});

		if (delegatedForeignChildRender) {
			return delegatedForeignChildRender;
		}

		const hasForeignChildren =
			options.hasForeignChildDescendants(options.input.component) ||
			this.requiresForeignChildRuntime(options.input);
		const activeRenderContext = getComponentRenderContext();

		if (!hasForeignChildren) {
			if (activeRenderContext && activeRenderContext.currentIntegration === options.currentIntegrationName) {
				return options.normalizeComponentRenderOutput(await options.renderComponent(options.input));
			}

			const sameIntegrationExecution = await runWithComponentRenderContext(
				{
					currentIntegration: options.currentIntegrationName,
				},
				async () => options.renderComponent(options.input),
			);

			return options.normalizeComponentRenderOutput(sameIntegrationExecution.value);
		}

		const execution = await runWithComponentRenderContext(
			{
				currentIntegration: options.currentIntegrationName,
				foreignChildRuntime: options.createForeignChildRuntime({
					renderInput: options.input,
					rendererCache,
				}),
			},
			async () => options.renderComponent(options.input),
		);

		return options.normalizeComponentRenderOutput(execution.value);
	}

	private getRendererCache(
		integrationContext?: BaseIntegrationContext,
	): Map<string, ForeignSubtreeExecutionOwningRenderer> | undefined {
		if (integrationContext?.rendererCache instanceof Map) {
			return integrationContext.rendererCache as Map<string, ForeignSubtreeExecutionOwningRenderer>;
		}

		return undefined;
	}

	private withRendererCache(
		input: ComponentRenderInput,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): ComponentRenderInput {
		const integrationContext = input.integrationContext;
		const sharedRendererCache = rendererCache as BaseIntegrationContext['rendererCache'];

		return {
			...input,
			integrationContext: integrationContext
				? { ...integrationContext, rendererCache: sharedRendererCache }
				: { rendererCache: sharedRendererCache },
		};
	}

	private getForeignOwnerIntegrationName(
		component: EcoComponent,
		currentIntegrationName: string,
	): string | undefined {
		const integrationName = component.config?.integration ?? component.config?.identity?.integration;
		if (!integrationName || integrationName === 'html' || integrationName === currentIntegrationName) {
			return undefined;
		}

		return integrationName;
	}

	private async resolveForeignChildInOwningRenderer(options: {
		currentIntegrationName: string;
		input: ComponentRenderInput;
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>;
		getOwningRenderer(
			integrationName: string,
			rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
		): Promise<ForeignSubtreeExecutionOwningRenderer>;
	}): Promise<ComponentRenderResult | undefined> {
		return await this.runInForeignOwningRenderer({
			currentIntegrationName: options.currentIntegrationName,
			input: options.input,
			rendererCache: options.rendererCache,
			getOwningRenderer: options.getOwningRenderer,
			run: (owningRenderer, delegatedInput) => owningRenderer.renderComponentWithForeignChildren(delegatedInput),
		});
	}

	private async resolveForeignSubtreeInOwningRenderer(options: {
		currentIntegrationName: string;
		input: ComponentRenderInput;
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>;
		getOwningRenderer(
			integrationName: string,
			rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
		): Promise<ForeignSubtreeExecutionOwningRenderer>;
	}): Promise<ForeignSubtreeRenderPayload | undefined> {
		return await this.runInForeignOwningRenderer({
			currentIntegrationName: options.currentIntegrationName,
			input: options.input,
			rendererCache: options.rendererCache,
			getOwningRenderer: options.getOwningRenderer,
			run: async (owningRenderer, delegatedInput) =>
				toForeignSubtreeRenderPayload(await owningRenderer.renderComponentWithForeignChildren(delegatedInput)),
		});
	}

	private async runInForeignOwningRenderer<TResult>(options: {
		currentIntegrationName: string;
		input: ComponentRenderInput;
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>;
		getOwningRenderer(
			integrationName: string,
			rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
		): Promise<ForeignSubtreeExecutionOwningRenderer>;
		run(
			owningRenderer: ForeignSubtreeExecutionOwningRenderer,
			delegatedInput: ComponentRenderInput,
		): Promise<TResult>;
	}): Promise<TResult | undefined> {
		const foreignOwnerIntegrationName = this.getForeignOwnerIntegrationName(
			options.input.component,
			options.currentIntegrationName,
		);
		if (!foreignOwnerIntegrationName) {
			return undefined;
		}

		const owningRenderer = await options.getOwningRenderer(foreignOwnerIntegrationName, options.rendererCache);
		if (owningRenderer.name === options.currentIntegrationName) {
			return undefined;
		}

		const delegatedInputWithCache = this.withRendererCache(options.input, options.rendererCache);
		const delegatedChildren = delegatedInputWithCache.children ?? delegatedInputWithCache.props.children;

		return await options.run(owningRenderer, {
			...delegatedInputWithCache,
			children: delegatedChildren,
		});
	}

	async resolveQueuedTokens(
		html: string,
		queuedResolutionsByToken: Map<string, QueuedForeignSubtreeResolution>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<string> {
		let resolvedHtml = html;

		for (const token of queuedResolutionsByToken.keys()) {
			if (!resolvedHtml.includes(token)) {
				continue;
			}

			resolvedHtml = resolvedHtml.split(token).join(await resolveToken(token));
		}

		return resolvedHtml;
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
