import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	BoundaryPlan,
	BoundaryPlanNode,
	BoundaryPlanNodeSource,
	BoundaryValidationError,
	EcoComponent,
} from '../../types/public-types.ts';

type BoundaryPlanBuildInput = {
	routeFile: string;
	currentIntegrationName: string;
	HtmlTemplate: EcoComponent;
	Layout?: EcoComponent;
	Page: EcoComponent;
};

type BoundaryPlanBuildEntry = {
	component: EcoComponent;
	source: Extract<BoundaryPlanNodeSource, 'page' | 'layout' | 'html-template'>;
};

/**
 * Builds a declared ownership plan from the component dependency graph.
 *
 * The plan is intentionally conservative: it reflects declared component
 * dependencies available during render preparation and records diagnostics for
 * foreign ownership edges that cannot be validated against registered
 * integrations or stable component metadata.
 */
export class BoundaryPlanningService {
	private readonly appConfig: EcoPagesAppConfig;
	private nextSyntheticId = 0;

	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	buildPlan(input: BoundaryPlanBuildInput): BoundaryPlan {
		this.nextSyntheticId = 0;

		const validationErrors: BoundaryValidationError[] = [];
		const rendererNames = new Set<string>([input.currentIntegrationName]);
		let foreignEdgeCount = 0;

		const buildNode = (
			component: EcoComponent,
			source: Exclude<BoundaryPlanNodeSource, 'route'>,
			parentIntegrationName: string,
			lineage: Set<object>,
		): BoundaryPlanNode => {
			const integrationName =
				component.config?.integration ?? component.config?.__eco?.integration ?? parentIntegrationName;
			const componentMeta = component.config?.__eco;
			const isForeignToParent = integrationName !== parentIntegrationName;
			const componentId = componentMeta?.id ?? componentMeta?.file ?? `${source}:${(this.nextSyntheticId += 1)}`;

			rendererNames.add(integrationName);

			if (isForeignToParent) {
				foreignEdgeCount += 1;

				if (!componentMeta) {
					validationErrors.push({
						code: 'MISSING_COMPONENT_METADATA',
						message: `[ecopages] Foreign boundary "${componentId}" must provide stable __eco metadata so ownership diagnostics stay actionable. Declared dependencies must include all possible foreign children.`,
						componentId,
						integrationName,
					});
				}

				if (!this.isRegisteredIntegration(integrationName, input.currentIntegrationName)) {
					validationErrors.push({
						code: 'UNKNOWN_INTEGRATION_OWNER',
						message: `[ecopages] Foreign boundary "${componentId}" references unknown integration owner "${integrationName}". Declared dependencies must include all possible foreign children and those integrations must be registered.`,
						componentId,
						componentFile: componentMeta?.file,
						integrationName,
					});
				}
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

		const roots: BoundaryPlanBuildEntry[] = [
			{ component: input.HtmlTemplate, source: 'html-template' },
			...(input.Layout ? [{ component: input.Layout, source: 'layout' as const }] : []),
			{ component: input.Page, source: 'page' },
		];

		const root: BoundaryPlanNode = {
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

	private isRegisteredIntegration(integrationName: string, currentIntegrationName: string): boolean {
		if (integrationName === currentIntegrationName) {
			return true;
		}

		return this.appConfig.integrations.some((integration) => integration.name === integrationName);
	}
}
