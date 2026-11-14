import { applyAttributesToFirstElement } from '../../../html/html-transformer.service.ts';
import { getForeignSubtreeResolutionContextKey, getForeignSubtreeTokenPrefix } from './owning-renderer-resolution.ts';
import type {
	BaseIntegrationContext,
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
} from '../../../types/contracts.ts';
import type { InternalComponentRenderInput } from '../../../config/internal-types.ts';
import { getComponentOwner } from '../../../eco/component-identity.ts';
import {
	getComponentRenderContext,
	runWithComponentRenderContext,
	type ForeignChildRuntime,
} from '../../../eco/component-render-context.ts';
import { isMarkupNodeLike } from '../../../eco/component-render-output.ts';
import { assertForeignChildrenNotOpaque } from './foreign-child-output.utils.ts';

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

/**
 * Children of a queued foreign subtree after the host renderer has processed them.
 *
 * @remarks
 * Set `html` when the host serialized the children, or `children` to pass them
 * to the owning renderer unserialized. Leave both unset when there are no
 * children.
 */
export type QueuedForeignSubtreeChildRenderResult = {
	html?: string;
	children?: unknown;
};

/** Replaces every queued Foreign Subtree token in `html` with the subtree's markup. */
export type ResolveForeignSubtreeTokens = (html: string) => Promise<string>;

/**
 * Renders the children of one queued foreign subtree inside the host renderer.
 *
 * @remarks
 * Serialized children may hold tokens of Foreign Children queued in the same render; pass them through
 * `resolveTokens`, since core does not scan the returned HTML again.
 */
export type RenderQueuedForeignSubtreeChildren<TContext extends QueuedForeignSubtreeResolutionContext> = (
	children: unknown,
	runtimeContext: TContext,
	resolveTokens: ResolveForeignSubtreeTokens,
) => Promise<QueuedForeignSubtreeChildRenderResult>;

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
	input: InternalComponentRenderInput;
	renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult>;
	hasForeignChildDescendants(
		component: EcoComponent,
		foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
	): boolean;
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
	/** The Integration whose render queues the tokens; it names the token prefix and the runtime context key. */
	integrationName: string;
	createRuntimeContext?: (
		integrationContext: BaseIntegrationContext & Record<string, unknown>,
		rendererCache: Map<string, unknown>,
	) => TContext;
}

export interface ForeignSubtreeQueuedHtmlOptions<TContext extends QueuedForeignSubtreeResolutionContext> {
	currentIntegrationName: string;
	html: string;
	runtimeContext?: TContext;
	renderQueuedChildren: RenderQueuedForeignSubtreeChildren<TContext>;
	getOwningRenderer(
		integrationName: string,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): Promise<ForeignSubtreeExecutionOwningRenderer>;
}

export type ForeignSubtreeStringQueuedHtmlOptions = Omit<
	ForeignSubtreeQueuedHtmlOptions<QueuedForeignSubtreeResolutionContext>,
	'renderQueuedChildren'
>;

export interface ResolveQueuedForeignSubtreeTokensOptions<TContext extends QueuedForeignSubtreeResolutionContext> {
	html: string;
	runtimeContext?: TContext;
	/** The Integration whose render queued the tokens; it names the token prefix and error messages. */
	integrationName: string;
	renderQueuedChildren: RenderQueuedForeignSubtreeChildren<TContext>;
	resolveForeignSubtree: (
		input: ComponentRenderInput,
		rendererCache: Map<string, unknown>,
	) => Promise<ComponentRenderResult | undefined>;
}

/**
 * Executes one component render tree under Foreign Child support.
 *
 * This service owns mixed-integration execution policy and the queued token
 * mechanics renderers use when foreign children cannot resolve inline.
 */

function requiresForeignChildRuntime(input: ComponentRenderInput): boolean {
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

export function shouldDelegateForeignChild(input: ForeignSubtreeExecutionDecisionInput): boolean {
	return !!input.targetIntegration && input.targetIntegration !== input.currentIntegration;
}

export function getQueuedRuntimeContext<TContext extends QueuedForeignSubtreeResolutionContext>(
	input: ComponentRenderInput,
	runtimeContextKey: string,
): TContext | undefined {
	return getRuntimeContext<TContext>(input, runtimeContextKey);
}

export function createQueuedRuntime<TContext extends QueuedForeignSubtreeResolutionContext>(
	options: ForeignSubtreeQueuedRuntimeOptions<TContext>,
): ForeignChildRuntime {
	return createQueueRuntime<TContext>({
		renderInput: options.renderInput,
		rendererCache: options.rendererCache as Map<string, unknown>,
		integrationName: options.integrationName,
		shouldQueueForeignChild: (input) => shouldDelegateForeignChild(input),
		createRuntimeContext: options.createRuntimeContext,
	});
}

export function createQueueRuntime<TContext extends QueuedForeignSubtreeResolutionContext>(options: {
	renderInput: ComponentRenderInput;
	rendererCache: Map<string, unknown>;
	integrationName: string;
	shouldQueueForeignChild: (input: QueuedForeignChildDecisionInput) => boolean;
	createRuntimeContext?: (
		integrationContext: QueuedForeignSubtreeIntegrationContext,
		rendererCache: Map<string, unknown>,
	) => TContext;
}): ForeignChildRuntime {
	const runtimeContext = ensureRuntimeContext({
		...options,
		runtimeContextKey: getForeignSubtreeResolutionContextKey(options.integrationName),
	});
	const tokenPrefix = getForeignSubtreeTokenPrefix(options.integrationName);

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
		const token = createForeignSubtreeToken(tokenPrefix, runtimeContext, foreignSubtreeId);
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

export function getRuntimeContext<TContext extends QueuedForeignSubtreeResolutionContext>(
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
 * Resolves queued foreign subtrees for a renderer whose children are markup.
 *
 * @remarks
 * String children and markup nodes are serialized and their nested tokens
 * resolved. Structured children pass to the owning renderer unchanged; opaque
 * objects are rejected.
 */
export async function resolveStringQueuedHtml(options: ForeignSubtreeStringQueuedHtmlOptions): Promise<string> {
	return resolveQueuedHtml({
		...options,
		renderQueuedChildren: async (children, _runtimeContext, resolveTokens) => {
			if (children === undefined) {
				return {};
			}

			if (typeof children !== 'string' && !isMarkupNodeLike(children)) {
				assertForeignChildrenNotOpaque(children, options.currentIntegrationName);
				return { children };
			}

			return { html: await resolveTokens(typeof children === 'string' ? children : (children.outerHTML ?? '')) };
		},
	});
}

export async function resolveQueuedHtml<TContext extends QueuedForeignSubtreeResolutionContext>(
	options: ForeignSubtreeQueuedHtmlOptions<TContext>,
): Promise<string> {
	return resolveQueuedForeignSubtreeTokens({
		html: options.html,
		runtimeContext: options.runtimeContext,
		integrationName: options.currentIntegrationName,
		renderQueuedChildren: options.renderQueuedChildren,
		resolveForeignSubtree: (input, rendererCache) =>
			resolveForeignChildInOwningRenderer({
				currentIntegrationName: options.currentIntegrationName,
				input,
				rendererCache: rendererCache as Map<string, ForeignSubtreeExecutionOwningRenderer>,
				getOwningRenderer: options.getOwningRenderer,
			}),
	});
}

/**
 * Places the Foreign Subtrees queued during one render over their tokens in `html`.
 *
 * @remarks
 * The HTML is scanned once: each token is rendered by its owning renderer when the scan reaches it, its children
 * first, and the owner's root attributes are set on the subtree's leading element. The subtree's markup is scanned
 * the same way, since structured children can carry tokens of this render into the owner's output. A token that
 * appears twice is rendered once. A subtree that reaches its own token again is a cycle and throws.
 */
export async function resolveQueuedForeignSubtreeTokens<TContext extends QueuedForeignSubtreeResolutionContext>(
	options: ResolveQueuedForeignSubtreeTokensOptions<TContext>,
): Promise<string> {
	const runtimeContext = options.runtimeContext;
	if (!runtimeContext || runtimeContext.queuedResolutions.length === 0) {
		return options.html;
	}

	const tokenPrefix = getForeignSubtreeTokenPrefix(options.integrationName);
	const queuedResolutionsByToken = new Map<string, QueuedForeignSubtreeResolution>();
	const placedHtmlByToken = new Map<string, string>();
	const resolvingTokens = new Set<string>();

	const findResolution = (token: string): QueuedForeignSubtreeResolution | undefined => {
		const queued = runtimeContext.queuedResolutions;
		for (let index = queuedResolutionsByToken.size; index < queued.length; index += 1) {
			queuedResolutionsByToken.set(queued[index].token, queued[index]);
		}
		return queuedResolutionsByToken.get(token);
	};

	const placeToken = async (token: string): Promise<string | undefined> => {
		const placedHtml = placedHtmlByToken.get(token);
		if (placedHtml !== undefined) {
			return placedHtml;
		}

		const resolution = findResolution(token);
		if (!resolution) {
			return undefined;
		}

		if (resolvingTokens.has(token)) {
			throw new Error(
				`[ecopages] ${options.integrationName} foreign-subtree queue contains a cycle or unresolved dependency links.`,
			);
		}

		resolvingTokens.add(token);
		try {
			const renderedChildren = await options.renderQueuedChildren(
				resolution.props.children,
				runtimeContext,
				resolveTokens,
			);
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
					`[ecopages] ${options.integrationName} queued foreign subtree could not resolve its owning renderer.`,
				);
			}

			const stampedHtml =
				foreignSubtreeRender.canAttachAttributes && foreignSubtreeRender.rootAttributes
					? applyAttributesToFirstElement(foreignSubtreeRender.html, foreignSubtreeRender.rootAttributes)
					: foreignSubtreeRender.html;
			const html = await resolveTokens(stampedHtml);
			placedHtmlByToken.set(token, html);
			return html;
		} finally {
			resolvingTokens.delete(token);
		}
	};

	const resolveTokens: ResolveForeignSubtreeTokens = (html) => spliceTokens(html, tokenPrefix, placeToken);
	return resolveTokens(options.html);
}

/**
 * Replaces each `tokenPrefix` token in `html` that `place` knows, in one pass.
 *
 * @remarks
 * A token is `<prefix><scope>__<id>__`, and no scope contains `__` (see {@link createForeignSubtreeToken}). Text that
 * starts like a token but that `place` does not know is kept as written.
 */
async function spliceTokens(
	html: string,
	tokenPrefix: string,
	place: (token: string) => Promise<string | undefined>,
): Promise<string> {
	let start = html.indexOf(tokenPrefix);
	if (start === -1) {
		return html;
	}

	let output = '';
	let copied = 0;
	while (start !== -1) {
		const scopeEnd = html.indexOf('__', start + tokenPrefix.length);
		const idEnd = scopeEnd === -1 ? -1 : html.indexOf('__', scopeEnd + 2);
		const end = idEnd === -1 ? -1 : idEnd + 2;
		const placed = end === -1 ? undefined : await place(html.slice(start, end));
		if (placed === undefined) {
			start = html.indexOf(tokenPrefix, start + tokenPrefix.length);
			continue;
		}

		output += `${html.slice(copied, start)}${placed}`;
		copied = end;
		start = html.indexOf(tokenPrefix, end);
	}

	return `${output}${html.slice(copied)}`;
}

/**
 * Runs one component render under the current integration's render context and
 * resolves any queued foreign subtrees captured during that render.
 *
 * @remarks
 * Component renders always execute under a context that names the rendering
 * integration, even when no foreign-child runtime is installed.
 */
export async function executeComponentRender(
	options: ForeignSubtreeExecutionRenderOptions,
): Promise<ComponentRenderResult> {
	const rendererCache =
		getRendererCache(options.input.integrationContext) ?? new Map<string, ForeignSubtreeExecutionOwningRenderer>();
	const delegatedForeignChildRender = await resolveForeignChildInOwningRenderer({
		currentIntegrationName: options.currentIntegrationName,
		input: options.input,
		rendererCache,
		getOwningRenderer: options.getOwningRenderer,
	});

	if (delegatedForeignChildRender) {
		return delegatedForeignChildRender;
	}

	const hasForeignChildren =
		options.hasForeignChildDescendants(options.input.component, options.input.foreignChildRoots) ||
		requiresForeignChildRuntime(options.input);
	const activeRenderContext = getComponentRenderContext();

	if (!hasForeignChildren) {
		if (activeRenderContext && activeRenderContext.currentIntegration === options.currentIntegrationName) {
			return await options.renderComponent(options.input);
		}

		const sameIntegrationExecution = await runWithComponentRenderContext(
			{
				currentIntegration: options.currentIntegrationName,
			},
			async () => options.renderComponent(options.input),
		);

		return sameIntegrationExecution.value;
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

	return execution.value;
}

function getRendererCache(
	integrationContext?: BaseIntegrationContext,
): Map<string, ForeignSubtreeExecutionOwningRenderer> | undefined {
	if (integrationContext?.rendererCache instanceof Map) {
		return integrationContext.rendererCache as Map<string, ForeignSubtreeExecutionOwningRenderer>;
	}

	return undefined;
}

function withRendererCache(
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

function getForeignOwnerIntegrationName(component: EcoComponent, currentIntegrationName: string): string | undefined {
	const integrationName = getComponentOwner(component, currentIntegrationName);
	if (!integrationName || integrationName === currentIntegrationName) {
		return undefined;
	}

	return integrationName;
}

async function resolveForeignChildInOwningRenderer(options: {
	currentIntegrationName: string;
	input: ComponentRenderInput;
	rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>;
	getOwningRenderer(
		integrationName: string,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): Promise<ForeignSubtreeExecutionOwningRenderer>;
}): Promise<ComponentRenderResult | undefined> {
	return await runInForeignOwningRenderer({
		currentIntegrationName: options.currentIntegrationName,
		input: options.input,
		rendererCache: options.rendererCache,
		getOwningRenderer: options.getOwningRenderer,
		run: (owningRenderer, delegatedInput) => owningRenderer.renderComponentWithForeignChildren(delegatedInput),
	});
}

async function runInForeignOwningRenderer<TResult>(options: {
	currentIntegrationName: string;
	input: ComponentRenderInput;
	rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>;
	getOwningRenderer(
		integrationName: string,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): Promise<ForeignSubtreeExecutionOwningRenderer>;
	run(owningRenderer: ForeignSubtreeExecutionOwningRenderer, delegatedInput: ComponentRenderInput): Promise<TResult>;
}): Promise<TResult | undefined> {
	const foreignOwnerIntegrationName = getForeignOwnerIntegrationName(
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

	const delegatedInputWithCache = withRendererCache(options.input, options.rendererCache);
	const delegatedChildren = delegatedInputWithCache.children ?? delegatedInputWithCache.props.children;

	return await options.run(owningRenderer, {
		...delegatedInputWithCache,
		children: delegatedChildren,
	});
}

function createForeignSubtreeToken(
	tokenPrefix: string,
	runtimeContext: QueuedForeignSubtreeResolutionContext,
	foreignSubtreeId: number,
): string {
	return `${tokenPrefix}${runtimeContext.componentInstanceScope ?? 'root'}__${foreignSubtreeId}__`;
}

function ensureRuntimeContext<TContext extends QueuedForeignSubtreeResolutionContext>(options: {
	renderInput: ComponentRenderInput;
	rendererCache: Map<string, unknown>;
	runtimeContextKey: string;
	createRuntimeContext?: (
		integrationContext: QueuedForeignSubtreeIntegrationContext,
		rendererCache: Map<string, unknown>,
	) => TContext;
}): TContext {
	let integrationContext: QueuedForeignSubtreeIntegrationContext;
	if (typeof options.renderInput.integrationContext === 'object' && options.renderInput.integrationContext !== null) {
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
