import type { EcoComponent, OwnershipPlanNodeSource } from '../../../types/public-types.ts';

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

export function walkComponentGraph(input: {
	roots: ComponentGraphRoot[];
	currentIntegrationName: string;
	visitLayout?: boolean;
	onComponent?: (node: ComponentGraphWalkInput) => void | boolean;
	onConfig?: (config: EcoComponent['config']) => void;
}): void {
	const seenComponents = new Set<object>();
	const seenConfigs = new Set<object>();

	const visitComponent = (
		component: EcoComponent | Partial<EcoComponent>,
		parentIntegrationName: string,
		source?: Exclude<OwnershipPlanNodeSource, 'route'>,
	): void => {
		if (!component) {
			return;
		}

		const ecoComponent = component as EcoComponent;
		if (seenComponents.has(ecoComponent)) {
			return;
		}

		seenComponents.add(ecoComponent);
		const integrationName =
			ecoComponent.config?.integration ?? ecoComponent.config?.__eco?.integration ?? parentIntegrationName;

		if (input.onConfig && ecoComponent.config && !seenConfigs.has(ecoComponent.config)) {
			seenConfigs.add(ecoComponent.config);
			input.onConfig(ecoComponent.config);
		}

		if (input.onComponent) {
			const shouldContinue = input.onComponent({
				component: ecoComponent,
				parentIntegrationName,
				source,
			});
			if (shouldContinue === false) {
				return;
			}
		}

		if (input.visitLayout) {
			for (const layout of ecoComponent.config?.layouts ?? []) {
				if (layout?.config) {
					visitConfig(layout.config, integrationName);
				}
			}
		}

		for (const child of ecoComponent.config?.dependencies?.components ?? []) {
			visitComponent(child, integrationName, 'dependency');
		}
	};

	const visitConfig = (config: EcoComponent['config'], parentIntegrationName: string): void => {
		if (!config || seenConfigs.has(config)) {
			return;
		}

		seenConfigs.add(config);

		if (input.onConfig) {
			input.onConfig(config);
		}

		if (input.visitLayout) {
			for (const layout of config.layouts ?? []) {
				if (layout?.config) {
					visitConfig(layout.config, parentIntegrationName);
				}
			}
		}

		for (const child of config.dependencies?.components ?? []) {
			visitComponent(child, parentIntegrationName, 'dependency');
		}
	};

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
		const integrationName =
			component.config?.integration ?? component.config?.__eco?.integration ?? parentIntegrationName;
		const componentMeta = component.config?.__eco;
		const isForeignToParent = integrationName !== parentIntegrationName;
		const componentId = componentMeta?.id ?? componentMeta?.file ?? `${source}:${(nextSyntheticId += 1)}`;

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
