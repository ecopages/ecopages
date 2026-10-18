import { afterEach, describe, expect, it } from 'vitest';
import { formatRuntimeServerStartedMessage, resolveProcessRuntimeLabel } from './runtime-server-started-message.ts';

describe('resolveProcessRuntimeLabel', () => {
	afterEach(() => {
		delete process.versions.bun;
	});

	it('names Node when the process is Node', () => {
		expect(resolveProcessRuntimeLabel()).toBe('Node');
	});

	it('names Bun when the process is Bun', () => {
		Object.defineProperty(process.versions, 'bun', { value: '1.4.2', configurable: true });
		expect(resolveProcessRuntimeLabel()).toBe('Bun');
	});
});

describe('formatRuntimeServerStartedMessage', () => {
	it('formats Bun and Node with the same template', () => {
		expect(formatRuntimeServerStartedMessage('Bun', 'http://localhost:4007/')).toBe(
			'Bun server running at http://localhost:4007',
		);
		expect(formatRuntimeServerStartedMessage('Node', 'http://localhost:4007/')).toBe(
			'Node server running at http://localhost:4007',
		);
	});
});
