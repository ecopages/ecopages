import type { EcoComponent, OwnershipPlanNodeSource } from '../../types/public-types.ts';

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

export function mapDeclaredOwnershipGraph<T>(input: {
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
