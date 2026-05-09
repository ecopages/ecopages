import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type {
	BaseIntegrationContext,
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	ForeignSubtreeRenderPayload,
} from '../../types/public-types.ts';
import {
	getComponentRenderContext,
	runWithComponentRenderContext,
	type ForeignChildRuntime,
} from './component-render-context.ts';
import {
	QueuedForeignSubtreeResolutionService,
	type QueuedForeignSubtreeResolution,
	type QueuedForeignSubtreeResolutionContext,
} from './queued-foreign-subtree-resolution.service.ts';

export interface ForeignSubtreeExecutionOwningRenderer {
	readonly name: string;
	renderComponentWithForeignChildren(input: ComponentRenderInput): Promise<ComponentRenderResult>;
	renderForeignSubtree(input: ComponentRenderInput): Promise<ForeignSubtreeRenderPayload>;
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
	): ForeignSubtreeExecutionOwningRenderer;
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
	): ForeignSubtreeExecutionOwningRenderer;
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
	): Promise<{ assets: ProcessedAsset[]; html?: string }>;
	getOwningRenderer(
		integrationName: string,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): ForeignSubtreeExecutionOwningRenderer;
	applyAttributesToFirstElement(html: string, attributes: Record<string, string>): string;
	dedupeProcessedAssets(assets: ProcessedAsset[]): ProcessedAsset[];
}

/**
 * Executes one component render tree under Foreign Child support.
 *
 * This service owns the execution policy for mixed-integration component trees:
 * it decides when a child stays inline, when it must delegate to an owning
 * renderer, how one render-pass renderer cache is reused, and how queued
 * Foreign Subtree tokens resolve back into final HTML.
 */
export class ForeignSubtreeExecutionService {
	private readonly queuedForeignSubtreeResolutionService: QueuedForeignSubtreeResolutionService;

	constructor(queuedForeignSubtreeResolutionService = new QueuedForeignSubtreeResolutionService()) {
		this.queuedForeignSubtreeResolutionService = queuedForeignSubtreeResolutionService;
	}

	/**
	 * Returns whether the current render pass must hand the child off to a foreign owner.
	 */
	shouldDelegateForeignChild(input: ForeignSubtreeExecutionDecisionInput): boolean {
		return !!input.targetIntegration && input.targetIntegration !== input.currentIntegration;
	}

	/**
	 * Creates the base runtime used when a renderer has not supplied its own queueing runtime.
	 *
	 * The runtime allows same-integration children to continue inline and fails fast
	 * when execution crosses into a foreign owner without a renderer-owned handoff.
	 */
	createFailFastRuntime(rendererName: string): ForeignChildRuntime {
		const interceptForeignChild = (input: ForeignSubtreeExecutionDecisionInput) => {
			if (!this.shouldDelegateForeignChild(input)) {
				return { kind: 'inline' as const };
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
		return this.queuedForeignSubtreeResolutionService.getRuntimeContext<TContext>(input, runtimeContextKey);
	}

	createQueuedRuntime<TContext extends QueuedForeignSubtreeResolutionContext>(
		options: ForeignSubtreeQueuedRuntimeOptions<TContext>,
	): ForeignChildRuntime {
		return this.queuedForeignSubtreeResolutionService.createRuntime<TContext>({
			renderInput: options.renderInput,
			rendererCache: options.rendererCache as Map<string, unknown>,
			runtimeContextKey: options.runtimeContextKey,
			tokenPrefix: options.tokenPrefix,
			shouldQueueForeignChild: (input) => this.shouldDelegateForeignChild(input),
			createRuntimeContext: options.createRuntimeContext,
		});
	}

	/**
	 * Resolves a string-first renderer HTML fragment that may contain queued Foreign Subtree tokens.
	 */
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

				const html = await this.resolveQueuedTokens(
					typeof children === 'string' ? children : String(children ?? ''),
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
		return this.queuedForeignSubtreeResolutionService.resolveQueuedHtml({
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

	/**
	 * Executes one component render with Foreign Child support under the current integration.
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

		const hasForeignChildren = options.hasForeignChildDescendants(options.input.component);
		const activeRenderContext = getComponentRenderContext();

		if (!hasForeignChildren) {
			if (!activeRenderContext || activeRenderContext.currentIntegration === options.currentIntegrationName) {
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

	/**
	 * Returns the delegatable owning renderer integration for one component.
	 *
	 * The pseudo `html` integration marks document-shell ownership only and does
	 * not participate in component-level foreign subtree execution.
	 */
	private getForeignOwnerIntegrationName(
		component: EcoComponent,
		currentIntegrationName: string,
	): string | undefined {
		const integrationName = component.config?.integration ?? component.config?.__eco?.integration;
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
		): ForeignSubtreeExecutionOwningRenderer;
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
		): ForeignSubtreeExecutionOwningRenderer;
	}): Promise<ForeignSubtreeRenderPayload | undefined> {
		return await this.runInForeignOwningRenderer({
			currentIntegrationName: options.currentIntegrationName,
			input: options.input,
			rendererCache: options.rendererCache,
			getOwningRenderer: options.getOwningRenderer,
			run: (owningRenderer, delegatedInput) => owningRenderer.renderForeignSubtree(delegatedInput),
		});
	}

	private async runInForeignOwningRenderer<TResult>(options: {
		currentIntegrationName: string;
		input: ComponentRenderInput;
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>;
		getOwningRenderer(
			integrationName: string,
			rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
		): ForeignSubtreeExecutionOwningRenderer;
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

		const owningRenderer = options.getOwningRenderer(foreignOwnerIntegrationName, options.rendererCache);
		if (owningRenderer.name === options.currentIntegrationName) {
			return undefined;
		}

		return await options.run(owningRenderer, this.withRendererCache(options.input, options.rendererCache));
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
}
