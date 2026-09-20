import type { EcoComponent, OwnershipPlanNodeSource } from '../../../types/public-types.ts';
import { getComponentIdentity } from '../../../eco/component-identity.ts';

export type DeclaredOwnershipRoot = {
	component: EcoComponent;
	source: Extract<OwnershipPlanNodeSource, 'page' | 'layout' | 'html-template'>;
};

export type DeclaredOwnershipNodeInput = {
	component: EcoComponent;
	source: Exclude<OwnershipPlanNodeSource, 'route'>;
	parentIntegrationName: string;
	integrationName: string;
	componentId: string;
	isForeignToParent: boolean;
};

export type ComponentGraphRoot = {
	component: EcoComponent | Partial<EcoComponent>;
	source?: Exclude<OwnershipPlanNodeSource, 'route'>;
};

export type ComponentGraphWalkInput = {
	component: EcoComponent;
	parentIntegrationName: string;
	source?: Exclude<OwnershipPlanNodeSource, 'route'>;
};

type ComponentGraphWalkState = {
	seenComponents: Set<object>;
	seenConfigs: Set<object>;
	visitLayout?: boolean;
	onComponent?: (node: ComponentGraphWalkInput) => void | boolean;
	onConfig?: (config: EcoComponent['config']) => void;
};

function visitComponentGraphConfig(
	config: EcoComponent['config'],
	parentIntegrationName: string,
	state: ComponentGraphWalkState,
	visitComponent: (
		component: EcoComponent | Partial<EcoComponent>,
		parentIntegrationName: string,
		source?: Exclude<OwnershipPlanNodeSource, 'route'>,
	) => void,
): void {
	if (!config || state.seenConfigs.has(config)) {
		return;
	}

	state.seenConfigs.add(config);
	if (state.onConfig) {
		state.onConfig(config);
	}

	if (state.visitLayout) {
		for (const layout of config.layouts ?? []) {
			if (layout?.config) {
				visitComponentGraphConfig(layout.config, parentIntegrationName, state, visitComponent);
			}
		}
	}

	for (const child of config.dependencies?.components ?? []) {
		visitComponent(child, parentIntegrationName, 'dependency');
	}
}

function notifyComponentGraphConfig(config: EcoComponent['config'], state: ComponentGraphWalkState): void {
	if (!state.onConfig || !config || state.seenConfigs.has(config)) {
		return;
	}

	state.seenConfigs.add(config);
	state.onConfig(config);
}

function visitComponentGraphChildren(
	ecoComponent: EcoComponent,
	integrationName: string,
	state: ComponentGraphWalkState,
	visitComponent: (
		component: EcoComponent | Partial<EcoComponent>,
		parentIntegrationName: string,
		source?: Exclude<OwnershipPlanNodeSource, 'route'>,
	) => void,
): void {
	if (state.visitLayout) {
		for (const layout of ecoComponent.config?.layouts ?? []) {
			if (layout?.config) {
				visitComponentGraphConfig(layout.config, integrationName, state, visitComponent);
			}
		}
	}

	for (const child of ecoComponent.config?.dependencies?.components ?? []) {
		visitComponent(child, integrationName, 'dependency');
	}
}

function createComponentGraphVisitor(state: ComponentGraphWalkState) {
	const visitComponent = (
		component: EcoComponent | Partial<EcoComponent>,
		parentIntegrationName: string,
		source?: Exclude<OwnershipPlanNodeSource, 'route'>,
	): void => {
		if (!component) {
			return;
		}

		const ecoComponent = component as EcoComponent;
		if (state.seenComponents.has(ecoComponent)) {
			return;
		}

		state.seenComponents.add(ecoComponent);
		const identity = getComponentIdentity(ecoComponent);
		const integrationName = ecoComponent.config?.integration ?? identity?.integration ?? parentIntegrationName;

		notifyComponentGraphConfig(ecoComponent.config, state);

		if (state.onComponent) {
			const shouldContinue = state.onComponent({
				component: ecoComponent,
				parentIntegrationName,
				source,
			});
			if (shouldContinue === false) {
				return;
			}
		}

		visitComponentGraphChildren(ecoComponent, integrationName, state, visitComponent);
	};

	return visitComponent;
}

export function walkComponentGraph(input: {
	roots: ComponentGraphRoot[];
	currentIntegrationName: string;
	visitLayout?: boolean;
	onComponent?: (node: ComponentGraphWalkInput) => void | boolean;
	onConfig?: (config: EcoComponent['config']) => void;
}): void {
	const state: ComponentGraphWalkState = {
		seenComponents: new Set(),
		seenConfigs: new Set(),
		visitLayout: input.visitLayout,
		onComponent: input.onComponent,
		onConfig: input.onConfig,
	};
	const visitComponent = createComponentGraphVisitor(state);

	for (const root of input.roots) {
		visitComponent(root.component, input.currentIntegrationName, root.source);
	}
}

export function mapComponentGraph<T>(input: {
	roots: DeclaredOwnershipRoot[];
	currentIntegrationName: string;
	mapNode: (node: DeclaredOwnershipNodeInput, children: T[]) => T;
}): T[] {
	let nextSyntheticId = 0;

	const mapComponent = (
		component: EcoComponent,
		source: Exclude<OwnershipPlanNodeSource, 'route'>,
		parentIntegrationName: string,
		lineage: Set<object>,
	): T => {
		const identity = getComponentIdentity(component);
		const integrationName = component.config?.integration ?? identity?.integration ?? parentIntegrationName;
		const isForeignToParent = integrationName !== parentIntegrationName;
		const componentId = identity?.id ?? identity?.file ?? `${source}:${(nextSyntheticId += 1)}`;

		const nextLineage = new Set(lineage);
		nextLineage.add(component);
		const children = (component.config?.dependencies?.components ?? []).flatMap((child) => {
			if (!child || nextLineage.has(child)) {
				return [];
			}

			return [mapComponent(child, 'dependency', integrationName, nextLineage)];
		});

		return input.mapNode(
			{
				component,
				source,
				parentIntegrationName,
				integrationName,
				componentId,
				isForeignToParent,
			},
			children,
		);
	};

	return input.roots.map(({ component, source }) =>
		mapComponent(component, source, input.currentIntegrationName, new Set()),
	);
}
