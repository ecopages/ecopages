/**
 * React component SSR helpers: renderToString, foreign-subtree HTML, island attributes.
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoComponentConfig,
	EcoPagesElement,
} from '@ecopages/core';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type { IntegrationRenderer } from '@ecopages/core/route-renderer/integration-renderer';
import type { ReactNode } from 'react';
import { isValidElement } from 'react';
import { hasSingleRootElement } from './html-boundary.ts';
import { getIslandComponentKey, type HydrationAssetService } from '../hydration/hydration-asset.ts';
import { asNonReactShellComponent, asReactComponent, type SerializableProps } from './component-ownership.ts';
import { ReactRenderError } from './errors.ts';
import type { ReactRuntimeModules } from './react-runtime.ts';

export type ReactComponentRenderContext = {
	componentInstanceId?: string;
};

export type ReactForeignSubtreeResolutionContext = {
	rendererCache: Map<string, IntegrationRenderer<any>>;
	componentInstanceScope?: string;
	nextForeignSubtreeId: number;
	queuedResolutions: Array<{
		token: string;
		component: EcoComponent;
		props: Record<string, unknown>;
		componentInstanceId: string;
	}>;
	rawChildrenToken?: string;
	rawChildrenHtml?: string;
};

export function buildHydrationProps(props: SerializableProps | undefined): SerializableProps {
	if (!props || !Object.prototype.hasOwnProperty.call(props, 'locals')) {
		return props ?? {};
	}

	const { locals: _locals, ...hydrationProps } = props;
	return hydrationProps;
}

/**
 * Renders a non-React layout or HTML template and enforces that mixed shells
 * return serialized HTML.
 */
export async function renderNonReactShellComponent<P extends SerializableProps>(
	Component: (props: P) => EcoPagesElement | Promise<EcoPagesElement>,
	props: P,
	label: 'Layout' | 'HtmlTemplate' | 'Component',
): Promise<string> {
	const output = await Component(props);
	if (typeof output === 'string') {
		return output;
	}

	throw new ReactRenderError(`${label} must return a string when used as a mixed shell for React pages.`);
}

/**
 * Renders one React component while preserving already-resolved child HTML.
 *
 * @remarks
 * When nested foreign-subtree resolution has already produced child HTML, the child
 * payload must remain raw SSR output rather than a React string child, otherwise
 * React would escape it. This helper renders a unique token through React and swaps
 * that token back to the resolved HTML afterward.
 */
export function renderComponentHtml(options: {
	input: ComponentRenderInput;
	context: ReactComponentRenderContext;
	runtimeContext?: ReactForeignSubtreeResolutionContext;
	runtime: ReactRuntimeModules;
	normalizeUnresolvedMarkerArtifactHtml: (html: string) => string;
}): string {
	const { input, context, runtimeContext, runtime, normalizeUnresolvedMarkerArtifactHtml } = options;
	const { react, reactDomServer } = runtime;

	if (input.children === undefined) {
		return normalizeUnresolvedMarkerArtifactHtml(
			reactDomServer.renderToString(react.createElement(asReactComponent(input.component), input.props)),
		);
	}

	if (isValidElement(input.children)) {
		return normalizeUnresolvedMarkerArtifactHtml(
			reactDomServer.renderToString(
				react.createElement(asReactComponent(input.component), input.props, input.children),
			),
		);
	}

	const resolvedChildHtml = typeof input.children === 'string' ? input.children : String(input.children ?? '');
	const rawChildrenToken = `__ECO_RAW_HTML_CHILD_${context.componentInstanceId ?? 'component'}__`;
	if (runtimeContext) {
		runtimeContext.rawChildrenToken = rawChildrenToken;
		runtimeContext.rawChildrenHtml = resolvedChildHtml;
	}
	const html = reactDomServer.renderToString(
		react.createElement(asReactComponent(input.component), input.props, rawChildrenToken),
	);
	return normalizeUnresolvedMarkerArtifactHtml(html.split(rawChildrenToken).join(resolvedChildHtml));
}

export function toReactNode(children: unknown, integrationName: string): ReactNode {
	if (
		children === null ||
		typeof children === 'string' ||
		typeof children === 'number' ||
		typeof children === 'boolean' ||
		isValidElement(children) ||
		Array.isArray(children)
	) {
		return children;
	}

	throw new TypeError(`[ecopages] ${integrationName} renderer expected a React node child.`);
}

/**
 * Restores raw child HTML placeholders stored on the foreign-subtree runtime context.
 *
 * @remarks
 * Queued foreign-subtree resolution may render children through a fragment path before
 * nested integration tokens are resolved. React must never see resolved child HTML as a
 * normal string child or it would escape it.
 */
export function restoreRuntimeChildHtml(
	html: string,
	runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
): string {
	if (!runtimeContext?.rawChildrenToken || runtimeContext.rawChildrenHtml === undefined) {
		return html;
	}

	return html.split(runtimeContext.rawChildrenToken).join(runtimeContext.rawChildrenHtml);
}

export async function renderQueuedChildrenToHtml(options: {
	children: unknown;
	runtimeContext: ReactForeignSubtreeResolutionContext;
	queuedResolutionsByToken: Map<string, ReactForeignSubtreeResolutionContext['queuedResolutions'][number]>;
	resolveToken: (token: string) => Promise<string>;
	runtime: ReactRuntimeModules;
	integrationName: string;
	normalizeUnresolvedMarkerArtifactHtml: (html: string) => string;
	resolveQueuedTokens: (
		html: string,
		queuedResolutionsByToken: Map<string, ReactForeignSubtreeResolutionContext['queuedResolutions'][number]>,
		resolveToken: (token: string) => Promise<string>,
	) => Promise<string>;
}): Promise<string | undefined> {
	const {
		children,
		runtimeContext,
		queuedResolutionsByToken,
		resolveToken,
		runtime,
		integrationName,
		normalizeUnresolvedMarkerArtifactHtml,
		resolveQueuedTokens,
	} = options;

	if (children === undefined) {
		return undefined;
	}

	const { react, reactDomServer } = runtime;

	let html = normalizeUnresolvedMarkerArtifactHtml(
		reactDomServer.renderToString(
			react.createElement(react.Fragment, null, toReactNode(children, integrationName)),
		),
	);
	html = restoreRuntimeChildHtml(html, runtimeContext);

	return await resolveQueuedTokens(html, queuedResolutionsByToken, resolveToken);
}

export async function renderReactQueuedForeignSubtreeChildren(options: {
	children: unknown;
	currentRuntimeContext: ReactForeignSubtreeResolutionContext;
	queuedResolutionsByToken: Map<string, ReactForeignSubtreeResolutionContext['queuedResolutions'][number]>;
	resolveToken: (token: string) => Promise<string>;
	runtime: ReactRuntimeModules;
	integrationName: string;
	normalizeUnresolvedMarkerArtifactHtml: (html: string) => string;
	resolveQueuedTokens: (
		html: string,
		queuedResolutionsByToken: Map<string, ReactForeignSubtreeResolutionContext['queuedResolutions'][number]>,
		resolveToken: (token: string) => Promise<string>,
	) => Promise<string>;
}): Promise<{ assets: ProcessedAsset[]; html?: string }> {
	const { currentRuntimeContext, ...rest } = options;
	const renderedHtml = await renderQueuedChildrenToHtml({
		...rest,
		runtimeContext: currentRuntimeContext,
	});

	if (renderedHtml === undefined) {
		return { assets: [] };
	}

	return {
		assets: [],
		html: renderedHtml,
	};
}

export async function renderForeignComponentWithSerializedHtml(options: {
	input: ComponentRenderInput;
	runtimeContext: ReactForeignSubtreeResolutionContext | undefined;
	integrationName: string;
	canResolveAssets: boolean;
	processComponentDependencies: (components: EcoComponent[]) => Promise<ProcessedAsset[]>;
	dedupeProcessedAssets: (assets: ProcessedAsset[]) => ProcessedAsset[];
	getRootTagName: (html: string) => string | undefined;
	resolveQueuedForeignSubtreeHtml: (
		html: string,
		runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
	) => Promise<{ assets: ProcessedAsset[]; html: string }>;
}): Promise<ComponentRenderResult> {
	const {
		input,
		runtimeContext,
		integrationName,
		canResolveAssets,
		processComponentDependencies,
		dedupeProcessedAssets,
		getRootTagName,
		resolveQueuedForeignSubtreeHtml,
	} = options;

	let props = input.props;
	if (input.children !== undefined) {
		props = {
			...input.props,
			children: typeof input.children === 'string' ? input.children : String(input.children ?? ''),
		};
	}

	const html = await renderNonReactShellComponent(
		asNonReactShellComponent<Record<string, unknown>>(input.component),
		props,
		'Component',
	);
	const hasDependencies = Boolean(input.component.config?.dependencies);
	const assets =
		hasDependencies && canResolveAssets ? await processComponentDependencies([input.component]) : undefined;
	const queuedForeignSubtreeResolution = await resolveQueuedForeignSubtreeHtml(html, runtimeContext);
	const mergedAssets = dedupeProcessedAssets([...(assets ?? []), ...queuedForeignSubtreeResolution.assets]);

	return {
		html: queuedForeignSubtreeResolution.html,
		canAttachAttributes: true,
		rootTag: getRootTagName(queuedForeignSubtreeResolution.html),
		integrationName,
		assets: mergedAssets.length > 0 ? mergedAssets : undefined,
	};
}

export async function renderReactManagedComponent(options: {
	input: ComponentRenderInput;
	runtimeContext: ReactForeignSubtreeResolutionContext | undefined;
	runtime: ReactRuntimeModules;
	integrationName: string;
	normalizeUnresolvedMarkerArtifactHtml: (html: string) => string;
	resolveQueuedForeignSubtreeHtml: (
		html: string,
		runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
	) => Promise<{ assets: ProcessedAsset[]; html: string }>;
	getRootTagName: (html: string) => string | undefined;
	dedupeProcessedAssets: (assets: ProcessedAsset[]) => ProcessedAsset[];
	hydrationAssetService: HydrationAssetService;
	canBuildIslandAssets: boolean;
}): Promise<ComponentRenderResult> {
	const {
		input,
		runtimeContext,
		runtime,
		integrationName,
		normalizeUnresolvedMarkerArtifactHtml,
		resolveQueuedForeignSubtreeHtml,
		getRootTagName,
		dedupeProcessedAssets,
		hydrationAssetService,
		canBuildIslandAssets,
	} = options;

	const componentConfig = input.component.config;
	const context: ReactComponentRenderContext = {
		componentInstanceId: input.integrationContext?.componentInstanceId,
	};
	const hasResolvedChildHtml = input.children !== undefined;
	let html = renderComponentHtml({
		input,
		context,
		runtimeContext,
		runtime,
		normalizeUnresolvedMarkerArtifactHtml,
	});
	const queuedForeignSubtreeResolution = await resolveQueuedForeignSubtreeHtml(html, runtimeContext);
	html = queuedForeignSubtreeResolution.html;
	const canAttachAttributes = hasSingleRootElement(html);
	const rootTag = getRootTagName(html);
	const componentFile = componentConfig?.__eco?.file;

	let rootAttributes: Record<string, string> | undefined;
	let assets: ProcessedAsset[] | undefined;

	if (
		canAttachAttributes &&
		componentFile &&
		context.componentInstanceId &&
		canBuildIslandAssets &&
		!hasResolvedChildHtml
	) {
		const componentInstanceId = context.componentInstanceId;
		assets = await hydrationAssetService.buildComponentRenderAssets(componentFile, componentConfig);
		rootAttributes = {
			'data-eco-component-id': componentInstanceId,
			'data-eco-component-key': getIslandComponentKey(componentFile, componentConfig),
			'data-eco-props': btoa(JSON.stringify(buildHydrationProps(input.props))),
		};
	}

	const mergedAssets = dedupeProcessedAssets([...(assets ?? []), ...queuedForeignSubtreeResolution.assets]);

	return {
		html,
		canAttachAttributes,
		rootTag,
		integrationName,
		rootAttributes,
		assets: mergedAssets.length > 0 ? mergedAssets : undefined,
	};
}

export function createForeignSubtreeRuntimeContext(options: {
	rendererCache: Map<string, IntegrationRenderer<any>>;
	componentInstanceScope?: string;
}): ReactForeignSubtreeResolutionContext {
	return {
		rendererCache: options.rendererCache,
		componentInstanceScope: options.componentInstanceScope,
		nextForeignSubtreeId: 0,
		queuedResolutions: [],
		rawChildrenToken: undefined,
		rawChildrenHtml: undefined,
	};
}
