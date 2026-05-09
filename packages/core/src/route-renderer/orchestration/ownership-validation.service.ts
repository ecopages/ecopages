import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { OwnershipPlanNodeSource, OwnershipValidationError, EcoComponent } from '../../types/public-types.ts';
import { mapDeclaredOwnershipGraph } from './declared-ownership-graph.ts';

type OwnershipValidationInput = {
	currentIntegrationName: string;
	roots: Array<{
		component: EcoComponent;
		source: Extract<OwnershipPlanNodeSource, 'page' | 'layout' | 'html-template'>;
	}>;
};

/**
 * Validates foreign ownership as soon as the route root graph is loaded.
 *
 * This check runs before route data and dependency preparation so ownership and
 * metadata problems are surfaced from the loaded component graph itself rather
 * than being entangled with ownership-plan construction.
 */
export class OwnershipValidationService {
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
	validate(input: OwnershipValidationInput): OwnershipValidationError[] {
		return mapDeclaredOwnershipGraph({
			roots: input.roots,
			currentIntegrationName: input.currentIntegrationName,
			mapNode: ({ component, integrationName, componentId, isForeignToParent }, children) => {
				const componentMeta = component.config?.__eco;
				const errors = children.flat();

				if (!isForeignToParent) {
					return errors;
				}

				if (!componentMeta) {
					errors.push({
						code: 'MISSING_COMPONENT_METADATA',
						message: `[ecopages] Foreign child "${componentId}" must provide stable __eco metadata so ownership diagnostics stay actionable. Declared dependencies must include all possible foreign children.`,
						componentId,
						integrationName,
					});
				}

				if (!this.isRegisteredIntegration(integrationName, input.currentIntegrationName)) {
					errors.push({
						code: 'UNKNOWN_INTEGRATION_OWNER',
						message: `[ecopages] Foreign child "${componentId}" references unknown integration owner "${integrationName}". Declared dependencies must include all possible foreign children and those integrations must be registered.`,
						componentId,
						componentFile: componentMeta?.file,
						integrationName,
					});
				}

				return errors;
			},
		}).flat();
	}

	private isRegisteredIntegration(integrationName: string, currentIntegrationName: string): boolean {
		if (integrationName === currentIntegrationName) {
			return true;
		}

		return this.appConfig.integrations.some((integration) => integration.name === integrationName);
	}
}
