import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { EcoComponent } from '../../../types/public-types.ts';
import { UndeclaredComponentDependencyError } from '../../../errors/undeclared-component-dependency-error.ts';
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

		expect(() =>
			service.validate({
				currentIntegrationName: 'kitajs',
				roots: [{ component: page, source: 'page' }],
			}),
		).toThrow(UndeclaredComponentDependencyError);
	});

	function createPageWithChild(childConfig: NonNullable<EcoComponent['config']>) {
		const child = (() => '<child />') as EcoComponent;
		child.config = childConfig;
		const page = (() => '<page />') as EcoComponent;
		page.config = {
			identity: { id: 'page', file: '/app/pages/index.kita.tsx', integration: 'kitajs' },
			dependencies: { components: [child] },
		};
		return page;
	}

	it('validates a child against its integration override, not the integration of its file', () => {
		const page = createPageWithChild({
			integration: 'missing-renderer',
			identity: { id: 'child', file: '/app/child.kita.tsx', integration: 'kitajs' },
		});

		const errors = new OwnershipValidationService(appConfig).validate({
			currentIntegrationName: 'kitajs',
			roots: [{ component: page, source: 'page' }],
		});

		expect(errors).toEqual([
			expect.objectContaining({ code: 'UNKNOWN_INTEGRATION_OWNER', integrationName: 'missing-renderer' }),
		]);
	});

	it('treats a child whose override names the current integration as its own', () => {
		const page = createPageWithChild({
			integration: 'kitajs',
			identity: { id: 'child', file: '/app/child.react.tsx', integration: 'missing-renderer' },
		});

		const errors = new OwnershipValidationService(appConfig).validate({
			currentIntegrationName: 'kitajs',
			roots: [{ component: page, source: 'page' }],
		});

		expect(errors).toEqual([]);
	});
});
