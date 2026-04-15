import type { ComponentBoundaryCapture } from '../orchestration/component-render-context.ts';
import type { ComponentRenderInput, ComponentRenderResult, EcoComponent } from '../../types/public-types.ts';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type { ComponentMarker, MarkerNodeId } from './component-marker.ts';
import { getComponentReference } from './component-reference.ts';
import { createComponentMarker, parseComponentMarkers } from './component-marker.ts';

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceMarkerByNodeId(html: string, nodeId: MarkerNodeId, replacement: string): string {
	const pattern = `<eco-marker[^>]*data-eco-node-id="${escapeRegex(nodeId)}"[^>]*><\\/eco-marker>`;
	return html.replace(new RegExp(pattern), replacement);
}

/**
 * Minimal renderer contract needed for deferred component resolution.
 *
 * The marker graph resolver intentionally depends only on component-level render
 * capabilities, not on the full integration renderer abstraction.
 */
export interface MarkerGraphComponentRenderer {
	renderComponentBoundary(input: ComponentRenderInput): Promise<ComponentRenderResult>;
}

export interface MarkerGraphResolverOptions {
	html: string;
	componentsToResolve: EcoComponent[];
	boundaryCapture: ComponentBoundaryCapture;
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
		childMarkers: ComponentMarker[],
		resolvedNodeHtml: Map<MarkerNodeId, string>,
	): string {
		let restoredChildren = serializedChildren;

		for (const childMarker of childMarkers) {
			const childNodeId = childMarker.nodeId;
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

	private buildNestedChildMarkerReader(capturedPropsByRef: ComponentBoundaryCapture['capturedPropsByRef']) {
		const markersByPropsRef = new Map<string, ComponentMarker[]>();

		return (marker: ComponentMarker): ComponentMarker[] => {
			if (markersByPropsRef.has(marker.propsRef)) {
				return markersByPropsRef.get(marker.propsRef) ?? [];
			}

			const children = capturedPropsByRef[marker.propsRef]?.children;
			const nestedMarkers =
				typeof children === 'string' && children.includes('<eco-marker') ? parseComponentMarkers(children) : [];

			markersByPropsRef.set(marker.propsRef, nestedMarkers);
			return nestedMarkers;
		};
	}

	/**
	 * Resolves every marker in the supplied HTML and returns the final HTML plus
	 * any assets produced by nested component renders.
	 *
	 * The resolver is intentionally fail-fast for broken component graphs such as
	 * missing component refs, missing integration ownership, or cyclic marker
	 * links. Uncaptured markers are preserved so nested compatibility resolution
	 * can pass through already-resolved child placeholders.
	 *
	 * The resolver does not render integration-specific HTML itself. Instead, it
	 * reconstructs `ComponentRenderInput` from the marker payload and delegates the
	 * actual rendering to the target integration renderer through
	 * `renderComponentBoundary()`. Nested marker children
	 * are resolved depth-first, memoized by node id, and cycle-checked while the
	 * final route HTML is updated incrementally. Markers with no captured props are
	 * preserved so nested boundary resolution can pass through already-resolved
	 * child placeholders; callers that require fully resolved HTML should reject
	 * any markers that remain after one pass.
	 *
	 * @param options Marker graph resolution inputs for one render pass.
	 * @returns Resolved HTML and collected component assets.
	 */
	async resolve(options: MarkerGraphResolverOptions): Promise<{ html: string; assets: ProcessedAsset[] }> {
		const registry = this.buildComponentRefRegistry(options.componentsToResolve);
		const capturedPropsByRef = options.boundaryCapture.capturedPropsByRef;
		const readNestedChildMarkers = this.buildNestedChildMarkerReader(capturedPropsByRef);
		const hasCapturedProps = (marker: ComponentMarker) => marker.propsRef in capturedPropsByRef;
		const resolvedNodeHtml = new Map<MarkerNodeId, string>();
		const resolvingNodeIds = new Set<MarkerNodeId>();
		const assets: ProcessedAsset[] = [];

		let resolvedHtml = options.html;

		const resolveMarker = async (marker: ComponentMarker): Promise<string> => {
			const cachedHtml = resolvedNodeHtml.get(marker.nodeId);
			if (cachedHtml) {
				return cachedHtml;
			}

			if (!hasCapturedProps(marker)) {
				return createComponentMarker(marker);
			}

			if (resolvingNodeIds.has(marker.nodeId)) {
				throw new Error('[ecopages] Component marker graph contains a cycle or unresolved dependency links.');
			}

			const component = registry.get(marker.componentRef);
			if (!component) {
				throw new Error(`[ecopages] Missing component reference for marker: ${marker.componentRef}`);
			}
			const integrationName = component.config?.integration ?? component.config?.__eco?.integration;
			if (!integrationName) {
				throw new Error(`[ecopages] Missing integration for marker component: ${marker.componentRef}`);
			}

			const props = capturedPropsByRef[marker.propsRef] as Record<string, unknown>;

			resolvingNodeIds.add(marker.nodeId);

			try {
				const normalizedProps = { ...props };
				let children: string | undefined;
				const serializedChildren = normalizedProps.children;
				const childMarkers = readNestedChildMarkers(marker);

				if (typeof serializedChildren === 'string' && childMarkers.length > 0) {
					for (const childMarker of childMarkers) {
						await resolveMarker(childMarker);
					}

					children = this.restoreSerializedChildren(serializedChildren, childMarkers, resolvedNodeHtml);
				}

				const renderer = options.resolveRenderer(integrationName);
				const componentInstanceId = options.instanceIdScope
					? `${options.instanceIdScope}_${marker.nodeId}`
					: marker.nodeId;
				const componentRender = await renderer.renderComponentBoundary({
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
				resolvedHtml = replaceMarkerByNodeId(resolvedHtml, marker.nodeId, htmlWithAttributes);
				return htmlWithAttributes;
			} finally {
				resolvingNodeIds.delete(marker.nodeId);
			}
		};

		for (const marker of parseComponentMarkers(options.html)) {
			await resolveMarker(marker);
		}

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
