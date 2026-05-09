import type {
	OwnershipPlan,
	OwnershipPlanNode,
	OwnershipPlanNodeSource,
	OwnershipValidationError,
	EcoComponent,
} from '../../types/public-types.ts';
import { mapDeclaredOwnershipGraph } from './declared-ownership-graph.ts';

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
		const validationErrors = input.validationErrors ?? [];
		const rendererNames = new Set<string>([input.currentIntegrationName]);
		let foreignEdgeCount = 0;

		const roots: OwnershipPlanBuildEntry[] = [
			{ component: input.HtmlTemplate, source: 'html-template' },
			...(input.Layout ? [{ component: input.Layout, source: 'layout' as const }] : []),
			{ component: input.Page, source: 'page' },
		];

		const children = mapDeclaredOwnershipGraph({
			roots,
			currentIntegrationName: input.currentIntegrationName,
			mapNode: ({ component, source, integrationName, componentId, isForeignToParent }, children) => {
				const componentMeta = component.config?.__eco;

				rendererNames.add(integrationName);

				if (isForeignToParent) {
					foreignEdgeCount += 1;
				}

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
			},
		});

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
			children,
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
