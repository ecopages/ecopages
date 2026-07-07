import { describe, expect, it } from 'vitest';
import { getEcopagesServerReadySignal } from './isolated-dev-server-ready.ts';

describe('getEcopagesServerReadySignal', () => {
	it('waits for the runtime startup log on stdout', () => {
		const signal = getEcopagesServerReadySignal();
		expect(signal.wait.stdout.test('[@ecopages/core] Bun server running at http://localhost:4010')).toBe(true);
		expect(signal.wait.stdout.test('[@ecopages/core] Node server running at http://localhost:4010')).toBe(true);
	});
});
