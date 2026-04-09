import type { ComponentRenderInput, ComponentRenderResult, EcoComponent } from '../../types/public-types.ts';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type { MarkerNodeId } from './component-marker.ts';
import { getComponentReference } from './component-reference.ts';
import { extractComponentGraph } from './component-graph.ts';
import { resolveComponentGraph } from './component-graph-executor.ts';

/**
 * Serializable graph-context payload used during post-render marker resolution.
 *
 * `propsByRef` stores serialized props captured during the first render pass,
 * while `slotChildrenByRef` preserves parent-child marker relationships for
 * slot-like composition.
 */
export type MarkerGraphContext = {
	propsByRef?: Record<string, Record<string, unknown>>;
	slotChildrenByRef?: Record<string, MarkerNodeId[]>;
};

/**
 * Minimal renderer contract needed for deferred component resolution.
 *
 * The marker graph resolver intentionally depends only on component-level render
 * capabilities, not on the full integration renderer abstraction.
 */
export interface MarkerGraphComponentRenderer {
	renderComponentForMarkerGraph(input: ComponentRenderInput): Promise<ComponentRenderResult>;
}

export interface MarkerGraphResolverOptions {
	html: string;
	componentsToResolve: EcoComponent[];
	graphContext: MarkerGraphContext;
	resolveRenderer: (integrationName: string) => MarkerGraphComponentRenderer;
	applyAttributesToFirstElement: (html: string, attributes: Record<string, string>) => string;
	instanceIdScope?: string;
}

/**
 * Resolves deferred `eco-marker` tokens after the first render pass.
 *
 * This service owns the second-stage orchestration for cross-integration
 * component rendering. It builds a component reference registry, constructs a
 * deterministic marker DAG, resolves leaf nodes before parents, and collects any
 * component-level assets emitted during that process.
 *
 * Responsibility split:
 * - core resolves marker structure, refs, child ordering, and renderer dispatch
 * - the target integration renderer resolves the actual component render through
 *   `renderComponent()` once the marker has been decoded into component input
 */
export class MarkerGraphResolver {
	private restoreSerializedChildren(
		serializedChildren: string,
		childNodeIds: MarkerNodeId[],
		resolvedNodeHtml: Map<MarkerNodeId, string>,
	): string {
		let restoredChildren = serializedChildren;

		for (const childNodeId of childNodeIds) {
			const resolvedChildHtml = resolvedNodeHtml.get(childNodeId);
			if (!resolvedChildHtml) {
				continue;
			}

			const markerRegex = new RegExp(
				`<eco-marker\\b(?=[^>]*data-eco-node-id="${childNodeId}")[^>]*><\\/eco-marker>`,
				'g',
			);

			restoredChildren = restoredChildren.replace(markerRegex, resolvedChildHtml);
		}

		return restoredChildren;
	}

	/**
	 * Resolves every marker in the supplied HTML and returns the final HTML plus
	 * any assets produced by nested component renders.
	 *
	 * The resolver is intentionally fail-fast: missing component refs or props refs
	 * indicate a broken render graph and should surface immediately instead of
	 * producing partial output.
	 *
	 * The resolver does not render integration-specific HTML itself. Instead, it
	 * reconstructs `ComponentRenderInput` from the marker payload and then delegates
	 * the actual rendering to the target integration renderer.
	 *
	 * @param options Marker graph resolution inputs for one render pass.
	 * @returns Resolved HTML and collected component assets.
	 */
	async resolve(options: MarkerGraphResolverOptions): Promise<{ html: string; assets: ProcessedAsset[] }> {
		const registry = this.buildComponentRefRegistry(options.componentsToResolve);
		const graph = extractComponentGraph(
			options.html,
			options.graphContext.slotChildrenByRef ?? {},
			options.graphContext.propsByRef ?? {},
		);
		const resolvedNodeHtml = new Map<MarkerNodeId, string>();
		const assets: ProcessedAsset[] = [];

		const resolvedHtml = await resolveComponentGraph(options.html, graph, async (marker) => {
			const component = registry.get(marker.componentRef);
			if (!component) {
				throw new Error(`[ecopages] Missing component reference for marker: ${marker.componentRef}`);
			}

			const props = options.graphContext.propsByRef?.[marker.propsRef];
			if (!props) {
				throw new Error(`[ecopages] Missing props reference for marker: ${marker.propsRef}`);
			}
			const normalizedProps = { ...props };

			let children: string | undefined;
			if (marker.slotRef) {
				const childNodeIds = options.graphContext.slotChildrenByRef?.[marker.slotRef] ?? [];
				if (childNodeIds.length > 0) {
					const serializedChildren = normalizedProps.children;
					children =
						typeof serializedChildren === 'string'
							? this.restoreSerializedChildren(serializedChildren, childNodeIds, resolvedNodeHtml)
							: childNodeIds.map((childNodeId) => resolvedNodeHtml.get(childNodeId) ?? '').join('');
				}
			}

			const renderer = options.resolveRenderer(marker.integration);
			const componentInstanceId = options.instanceIdScope
				? `${options.instanceIdScope}_${marker.nodeId}`
				: marker.nodeId;
			const componentRender = await renderer.renderComponentForMarkerGraph({
				component,
				props: normalizedProps,
				children,
				integrationContext: {
					componentInstanceId,
				},
			});

			if (componentRender.assets?.length) {
				assets.push(...componentRender.assets);
			}

			const htmlWithAttributes =
				componentRender.canAttachAttributes && componentRender.rootAttributes
					? options.applyAttributesToFirstElement(componentRender.html, componentRender.rootAttributes)
					: componentRender.html;

			resolvedNodeHtml.set(marker.nodeId, htmlWithAttributes);
			return { html: htmlWithAttributes };
		});

		return {
			html: resolvedHtml,
			assets,
		};
	}

	/**
	 * Builds a reference registry from the root component set and all nested
	 * declared component dependencies.
	 *
	 * Component refs are keyed by build metadata when available, falling back to a
	 * stable runtime reference for source-imported components. Traversal is depth-
	 * first and deduplicated by component identity to remain stable in shared
	 * dependency graphs.
	 *
	 * @param components Root components participating in resolution.
	 * @returns Lookup table from component ref to component definition.
	 */
	private buildComponentRefRegistry(components: EcoComponent[]): Map<string, EcoComponent> {
		const registry = new Map<string, EcoComponent>();
		const stack = [...components];
		const seen = new Set<EcoComponent>();

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current || seen.has(current)) {
				continue;
			}
			seen.add(current);

			registry.set(getComponentReference(current), current);

			const nested = current.config?.dependencies?.components ?? [];
			for (const component of nested) {
				stack.push(component);
			}
		}

		return registry;
	}
}
