import { describe, expect, it } from 'vitest';
import {
	getEcopagesPreviewReadySignal,
	getEcopagesServerReadySignal,
	getIsolatedDevServerReadySignal,
} from './isolated-dev-server-ready.ts';

describe('getEcopagesServerReadySignal', () => {
	it('waits for the shared ready marker on stdout', () => {
		const signal = getEcopagesServerReadySignal();
		const line = '[@ecopages/core] [@ecopages/ready] http://localhost:4010';
		expect(signal.wait.stdout.test(line)).toBe(true);
	});

	it('uses the same marker for every host wrapper', () => {
		expect(getIsolatedDevServerReadySignal('ecopages', 4007)).toEqual(getEcopagesServerReadySignal());
		expect(getIsolatedDevServerReadySignal('vite', 4012)).toEqual(getEcopagesServerReadySignal());
		expect(getEcopagesPreviewReadySignal()).toEqual(getEcopagesServerReadySignal());
	});
});
