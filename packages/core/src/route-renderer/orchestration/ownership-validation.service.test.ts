import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { EcoComponent } from '../../types/public-types.ts';
import { UndeclaredComponentDependencyError } from '../../errors/undeclared-component-dependency-error.ts';
import { OwnershipValidationService } from './ownership-validation.service.ts';

describe('OwnershipValidationService', () => {
	const appConfig = {
		integrations: [{ name: 'kitajs' }, { name: 'react' }],
	} as EcoPagesAppConfig;

	it('should throw when dependencies.components contains a plain function', () => {
		const plainChild = (() => '<child />') as EcoComponent;
		const page = (() => '<page />') as EcoComponent;
		page.config = {
			__eco: {
				id: 'page',
				file: '/app/pages/index.kita.tsx',
				integration: 'kitajs',
			},
			dependencies: {
				components: [plainChild],
			},
		};

		const service = new OwnershipValidationService(appConfig);

		expect(() =>
			service.validate({
				currentIntegrationName: 'kitajs',
				roots: [{ component: page, source: 'page' }],
			}),
		).toThrow(UndeclaredComponentDependencyError);
	});
});
