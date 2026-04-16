import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type { ComponentRenderInput, ComponentRenderResult, EcoComponent } from '../../types/public-types.ts';
import type { ComponentBoundaryRuntime } from './component-render-context.ts';
import {
	QueuedBoundaryRuntimeService,
	type QueuedBoundaryDecisionInput,
	type QueuedBoundaryRuntimeContext,
} from './queued-boundary-runtime.service.ts';

export type StringBoundaryRuntimeContext = QueuedBoundaryRuntimeContext;

/**
 * Shared queue service for string-first renderers.
 *
 * String renderers can treat nested children as already-serialized HTML, so this
 * wrapper keeps their boundary integration small while delegating the queue
 * bookkeeping and recursive token replacement to `QueuedBoundaryRuntimeService`.
 */
export class StringBoundaryRuntimeService {
	private readonly queuedBoundaryRuntimeService = new QueuedBoundaryRuntimeService();

	/**
	 * Reads the active string-boundary queue context from one component render.
	 */
	getRuntimeContext(
		input: ComponentRenderInput,
		runtimeContextKey: string,
	): StringBoundaryRuntimeContext | undefined {
		return this.queuedBoundaryRuntimeService.getRuntimeContext<StringBoundaryRuntimeContext>(
			input,
			runtimeContextKey,
		);
	}

	/**
	 * Creates the boundary runtime used by string-first renderers during one render
	 * pass.
	 */
	createRuntime(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, unknown>;
		runtimeContextKey: string;
		tokenPrefix: string;
		shouldQueueBoundary: (input: QueuedBoundaryDecisionInput) => boolean;
	}): ComponentBoundaryRuntime {
		return this.queuedBoundaryRuntimeService.createRuntime<StringBoundaryRuntimeContext>(options);
	}

	/**
	 * Resolves queued foreign-boundary tokens in already-serialized HTML.
	 */
	async resolveQueuedHtml(options: {
		html: string;
		runtimeContext?: StringBoundaryRuntimeContext;
		resolveBoundary: (
			input: ComponentRenderInput,
			rendererCache: Map<string, unknown>,
		) => Promise<ComponentRenderResult | undefined>;
		applyAttributesToFirstElement: (html: string, attributes: Record<string, string>) => string;
		dedupeProcessedAssets: (assets: ProcessedAsset[]) => ProcessedAsset[];
	}): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.queuedBoundaryRuntimeService.resolveQueuedHtml({
			html: options.html,
			runtimeContext: options.runtimeContext,
			queueLabel: 'String',
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
			resolveBoundary: options.resolveBoundary,
			applyAttributesToFirstElement: options.applyAttributesToFirstElement,
			dedupeProcessedAssets: options.dedupeProcessedAssets,
		});
	}
}