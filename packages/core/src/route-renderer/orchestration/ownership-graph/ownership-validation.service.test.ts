import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { EcoComponent } from '../../../types/public-types.ts';
import { UndeclaredComponentDependencyError } from '../../../errors/undeclared-component-dependency-error.ts';
import { createPreparedComponentGraphBuilder } from './component-graph.ts';
import { OwnershipValidationService } from './ownership-validation.service.ts';

describe('OwnershipValidationService', () => {
	const appConfig = {
		integrations: [{ name: 'kitajs' }, { name: 'react' }],
	} as EcoPagesAppConfig;

	it('should throw when dependencies.components contains a plain function', () => {
		const plainChild = (() => '<child />') as EcoComponent;
		const page = (() => '<page />') as EcoComponent;
		page.config = {
			identity: {
				id: 'page',
				file: '/app/pages/index.kita.tsx',
				integration: 'kitajs',
			},
			dependencies: {
				components: [plainChild],
			},
		};

		const service = new OwnershipValidationService(appConfig);
		const graphBuilder = createPreparedComponentGraphBuilder('kitajs');
		graphBuilder.addRoots([{ component: page, source: 'page' }]);

		expect(() => service.validateGraph(graphBuilder.getGraph())).toThrow(UndeclaredComponentDependencyError);
	});
});
