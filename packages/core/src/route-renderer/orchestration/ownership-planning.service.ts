import type {
	OwnershipPlan,
	OwnershipPlanNode,
	OwnershipPlanNodeSource,
	OwnershipValidationError,
	EcoComponent,
} from '../../types/public-types.ts';

type OwnershipPlanBuildInput = {
	routeFile: string;
	currentIntegrationName: string;
	HtmlTemplate: EcoComponent;
	Layout?: EcoComponent;
	Page: EcoComponent;
	validationErrors?: OwnershipValidationError[];
};

type OwnershipPlanBuildEntry = {
	component: EcoComponent;
	source: Extract<OwnershipPlanNodeSource, 'page' | 'layout' | 'html-template'>;
};

/**
 * Builds a declared ownership plan from the component dependency graph.
 *
 * The plan reflects the declared component dependency graph for one route after
 * route-root ownership validation has already run. It records ownership shape,
 * foreign-edge counts, and any validation errors supplied by an earlier
 * validation pass.
 */
export class OwnershipPlanningService {
	/**
	 * Builds the structural ownership plan for one route render.
	 */
	buildPlan(input: OwnershipPlanBuildInput): OwnershipPlan {
		let nextSyntheticId = 0;

		const validationErrors = input.validationErrors ?? [];
		const rendererNames = new Set<string>([input.currentIntegrationName]);
		let foreignEdgeCount = 0;

		const buildNode = (
			component: EcoComponent,
			source: Exclude<OwnershipPlanNodeSource, 'route'>,
			parentIntegrationName: string,
			lineage: Set<object>,
		): OwnershipPlanNode => {
			const integrationName =
				component.config?.integration ?? component.config?.__eco?.integration ?? parentIntegrationName;
			const componentMeta = component.config?.__eco;
			const isForeignToParent = integrationName !== parentIntegrationName;
			const componentId = componentMeta?.id ?? componentMeta?.file ?? `${source}:${(nextSyntheticId += 1)}`;

			rendererNames.add(integrationName);

			if (isForeignToParent) {
				foreignEdgeCount += 1;
			}

			const nextLineage = new Set(lineage);
			nextLineage.add(component);
			const children = (component.config?.dependencies?.components ?? []).flatMap((child) => {
				if (!child || nextLineage.has(child)) {
					return [];
				}

				return [buildNode(child, 'dependency', integrationName, nextLineage)];
			});

			return {
				id: componentId,
				source,
				ownership: {
					integrationName,
					componentId,
					componentFile: componentMeta?.file,
					isPageEntry: source === 'page',
					isForeignToParent,
				},
				children,
				declaredDependenciesValid: true,
			};
		};

		const roots: OwnershipPlanBuildEntry[] = [
			{ component: input.HtmlTemplate, source: 'html-template' },
			...(input.Layout ? [{ component: input.Layout, source: 'layout' as const }] : []),
			{ component: input.Page, source: 'page' },
		];

		const root: OwnershipPlanNode = {
			id: `route:${input.routeFile}`,
			source: 'route',
			ownership: {
				integrationName: input.currentIntegrationName,
				componentId: `route:${input.routeFile}`,
				componentFile: input.routeFile,
				isPageEntry: false,
				isForeignToParent: false,
			},
			children: roots.map(({ component, source }) =>
				buildNode(component, source, input.currentIntegrationName, new Set()),
			),
			declaredDependenciesValid: validationErrors.length === 0,
		};

		return {
			root,
			rendererNames: Array.from(rendererNames),
			foreignEdgeCount,
			hasValidationErrors: validationErrors.length > 0,
			validationErrors,
		};
	}
}
