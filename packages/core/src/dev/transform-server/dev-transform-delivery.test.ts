import { afterEach, describe, expect, it } from 'vitest';
import { resolveDevClientDeliveryMode } from './dev-transform-delivery.ts';

describe('resolveDevClientDeliveryMode', () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalVitest = process.env.VITEST;
	const originalDelivery = process.env.ECOPAGES_DEV_CLIENT_DELIVERY;

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		process.env.VITEST = originalVitest;
		if (originalDelivery === undefined) {
			delete process.env.ECOPAGES_DEV_CLIENT_DELIVERY;
		} else {
			process.env.ECOPAGES_DEV_CLIENT_DELIVERY = originalDelivery;
		}
	});

	it('defaults to rolldown in vitest', () => {
		process.env.VITEST = 'true';
		expect(resolveDevClientDeliveryMode()).toBe('rolldown');
	});

	it('honors runtime transform delivery outside tests', () => {
		delete process.env.VITEST;
		process.env.NODE_ENV = 'development';
		expect(resolveDevClientDeliveryMode({ devClientDelivery: 'transform' })).toBe('transform');
	});
});
