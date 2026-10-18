import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type { OwnershipValidationError } from '../../../types/contracts.ts';
import { assertEcoDeclaredComponent } from '../../../eco/eco-declared-component.ts';
import { getComponentIdentity } from '../../../eco/component-identity.ts';
import type { PreparedComponentGraph } from './component-graph.ts';

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
	 * Validates ownership edges and declarations already captured in the route graph.
	 */
	validateGraph(graph: PreparedComponentGraph): OwnershipValidationError[] {
		const nodeByComponent = new Map(graph.nodes.map((node) => [node.component, node]));
		for (const node of graph.nodes) {
			const parentFile = getComponentIdentity(node.component)?.file;
			for (const child of node.children) {
				assertEcoDeclaredComponent(child.component, { parentComponentFile: parentFile });
			}
		}

		const errors: OwnershipValidationError[] = [];
		for (const event of graph.events) {
			const component = event.type === 'component' ? event.node.component : event.component;
			const parentIntegrationName =
				event.type === 'component' ? event.node.parentIntegrationName : event.parentIntegrationName;
			const integrationName = event.type === 'component' ? event.node.integrationName : event.integrationName;
			const componentId = nodeByComponent.get(component)?.componentId ?? 'dependency:unknown';
			if (integrationName === parentIntegrationName) {
				continue;
			}

			const componentMeta = getComponentIdentity(component);
			if (!componentMeta) {
				errors.push({
					code: 'MISSING_COMPONENT_METADATA',
					message: `[ecopages] Foreign child "${componentId}" must provide stable component identity so ownership diagnostics stay actionable. Declared dependencies must include all possible foreign children.`,
					componentId,
					integrationName,
				});
			}

			if (!this.isRegisteredIntegration(integrationName, graph.currentIntegrationName)) {
				errors.push({
					code: 'UNKNOWN_INTEGRATION_OWNER',
					message: `[ecopages] Foreign child "${componentId}" references unknown integration owner "${integrationName}". Declared dependencies must include all possible foreign children and those integrations must be registered.`,
					componentId,
					componentFile: componentMeta?.file,
					integrationName,
				});
			}
		}

		return errors;
	}

	private isRegisteredIntegration(integrationName: string, currentIntegrationName: string): boolean {
		if (integrationName === currentIntegrationName) {
			return true;
		}

		return this.appConfig.integrations.some((integration) => integration.name === integrationName);
	}
}

/**
 * Throws when declared ownership validation collected one or more errors.
 */
export function throwIfOwnershipInvalid(validationErrors: OwnershipValidationError[]): void {
	if (validationErrors.length === 0) {
		return;
	}

	throw new Error(validationErrors.map((error) => error.message).join('\n'));
}
