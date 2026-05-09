import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { BoundaryPlanNodeSource, BoundaryValidationError, EcoComponent } from '../../types/public-types.ts';

type BoundaryOwnershipValidationInput = {
	currentIntegrationName: string;
	roots: Array<{
		component: EcoComponent;
		source: Extract<BoundaryPlanNodeSource, 'page' | 'layout' | 'html-template'>;
	}>;
};

/**
 * Validates foreign boundary ownership as soon as the route root graph is loaded.
 *
 * This check runs before route data and dependency preparation so ownership and
 * metadata problems are surfaced from the loaded component graph itself rather
 * than being entangled with boundary-plan construction.
 */
export class BoundaryOwnershipValidationService {
	private readonly appConfig: EcoPagesAppConfig;

	/**
	 * Creates the ownership validator for one finalized app config.
	 */
	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	/**
	 * Validates foreign ownership edges reachable from the supplied route roots.
	 */
	validate(input: BoundaryOwnershipValidationInput): BoundaryValidationError[] {
		const validationErrors: BoundaryValidationError[] = [];
		let nextSyntheticId = 0;

		const validateComponent = (
			component: EcoComponent,
			source: Exclude<BoundaryPlanNodeSource, 'route'>,
			parentIntegrationName: string,
			lineage: Set<object>,
		) => {
			const integrationName =
				component.config?.integration ?? component.config?.__eco?.integration ?? parentIntegrationName;
			const componentMeta = component.config?.__eco;
			const isForeignToParent = integrationName !== parentIntegrationName;
			const componentId = componentMeta?.id ?? componentMeta?.file ?? `${source}:${(nextSyntheticId += 1)}`;

			if (isForeignToParent) {
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

			for (const child of component.config?.dependencies?.components ?? []) {
				if (!child || nextLineage.has(child)) {
					continue;
				}

				validateComponent(child, 'dependency', integrationName, nextLineage);
			}
		};

		for (const { component, source } of input.roots) {
			validateComponent(component, source, input.currentIntegrationName, new Set());
		}

		return validationErrors;
	}

	private isRegisteredIntegration(integrationName: string, currentIntegrationName: string): boolean {
		if (integrationName === currentIntegrationName) {
			return true;
		}

		return this.appConfig.integrations.some((integration) => integration.name === integrationName);
	}
}
