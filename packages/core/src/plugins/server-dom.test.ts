import { describe, expect, it } from 'vitest';
import { installConfiguredServerDom, type ServerDomInstaller } from './server-dom.ts';

function createInstaller(kind: ServerDomInstaller['kind'], order: string[], label: string): ServerDomInstaller {
	return {
		kind,
		install() {
			order.push(label);
		},
	};
}

describe('installConfiguredServerDom', () => {
	it('runs complete surfaces before repairs when a repair is listed first', async () => {
		const order: string[] = [];

		await installConfiguredServerDom([
			{ serverDom: createInstaller('repair', order, 'repair') },
			{ serverDom: createInstaller('complete', order, 'complete') },
		]);

		expect(order).toEqual(['complete', 'repair']);
	});

	it('runs complete surfaces before repairs when a complete is listed first', async () => {
		const order: string[] = [];

		await installConfiguredServerDom([
			{ serverDom: createInstaller('complete', order, 'complete') },
			{ serverDom: createInstaller('repair', order, 'repair') },
		]);

		expect(order).toEqual(['complete', 'repair']);
	});

	it('does not overlap concurrent installer passes', async () => {
		const order: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const installer: ServerDomInstaller = {
			kind: 'complete',
			install: async () => {
				order.push('start');
				await gate;
				order.push('end');
			},
		};

		const first = installConfiguredServerDom([{ serverDom: installer }]);
		const second = installConfiguredServerDom([{ serverDom: installer }]);
		release();
		await Promise.all([first, second]);

		expect(order).toEqual(['start', 'end', 'start', 'end']);
	});

	it("runs a later caller's installers after an in-flight pass with a different set", async () => {
		const order: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const first = installConfiguredServerDom([
			{
				serverDom: {
					kind: 'complete',
					install: async () => {
						order.push('A-start');
						await gate;
						order.push('A-end');
					},
				},
			},
		]);
		const second = installConfiguredServerDom([
			{
				serverDom: {
					kind: 'repair',
					install() {
						order.push('B');
					},
				},
			},
		]);
		release();
		await Promise.all([first, second]);

		expect(order).toEqual(['A-start', 'A-end', 'B']);
	});
});
