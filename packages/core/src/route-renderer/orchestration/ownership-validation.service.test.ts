import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { EcoComponent } from '../../types/public-types.ts';
import { OwnershipValidationService, throwIfOwnershipInvalid } from './ownership-validation.service.ts';

describe('OwnershipValidationService', () => {
	const appConfig = {
		integrations: [{ name: 'kitajs' }, { name: 'react' }],
	} as EcoPagesAppConfig;

	it('should reject plain functions in dependencies.components', () => {
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
		const errors = service.validate({
			currentIntegrationName: 'kitajs',
			roots: [{ component: page, source: 'page' }],
		});

		expect(errors).toEqual([
			expect.objectContaining({
				code: 'UNDECLARED_COMPONENT_DEPENDENCY',
			}),
		]);
		expect(() => throwIfOwnershipInvalid(errors)).toThrow(
			/dependencies\.components entries must be eco\.component\(\)/,
		);
	});
});
